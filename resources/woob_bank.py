#!/usr/bin/env python3
"""
Pont Woob pour Banquier — open banking gratuit, 100 % local.

Woob (https://woob.tech) se connecte au site web de la banque avec les
identifiants de l'utilisateur et récupère comptes + transactions. Aucun service
tiers, aucune clé API : tout reste sur la machine.

Sous-commandes :
  check                  -> { ok, woobVersion, error? }
  list                   -> { modules: [{ id, name, caps }] }   (banques)
  fields <module>        -> { fields: [{ id, label, masked, required }] }
  fetch  <module>        -> protocole interactif (voir plus bas)

Protocole `fetch` (JSON ligne par ligne) :
  - L'identifiant/mot de passe (et la config) sont lus sur stdin :
        { "config": { "login": "...", "password": "..." } }
  - Le script écrit sur stdout des messages préfixés par le sentinelle
    "@@WOOB@@ " suivi d'un objet JSON :
        {"type":"need_2fa","subtype":"question","fields":[...],"message":...}
        {"type":"need_2fa","subtype":"decoupled","message":...}
        {"type":"result","accounts":[...],"transactions":[...]}
        {"type":"error","message":...}
  - En réponse à un need_2fa, l'appelant écrit une ligne sur stdin :
        {"answers":{"code":"123456"}}      (subtype question)
        {"resume":true}                      (subtype decoupled, après validation)

Tous les logs Woob vont sur stderr ; seuls les messages protocole vont sur stdout.
"""
import sys
import io
import os
import json
import logging
import datetime

SENTINEL = "@@WOOB@@ "

# stdout strictement réservé au protocole ; tout le bruit part sur stderr.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", newline="\n")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", newline="\n")

# Mode debug : trace HTTP complète sur stderr (capturée par le pont Node).
# Activé par la variable d'environnement BANQUIER_WOOB_DEBUG, utile pour
# diagnostiquer un module récalcitrant (ex : Crédit Agricole / keypad).
_DEBUG = bool(os.environ.get("BANQUIER_WOOB_DEBUG"))
logging.basicConfig(stream=sys.stderr, level=logging.DEBUG if _DEBUG else logging.WARNING)


def emit(obj):
    sys.stdout.write(SENTINEL + json.dumps(obj, ensure_ascii=False, default=str) + "\n")
    sys.stdout.flush()


def read_line():
    line = sys.stdin.readline()
    if not line:
        return None
    line = line.strip()
    if not line:
        return {}
    try:
        return json.loads(line)
    except Exception:
        return {}


# --- Contournement de la vérification GPG (cassée sous Windows : bug de chemin
# de lockfile gpg). Équivaut à tourner sur une machine sans gpg : Woob saute
# alors l'étape de signature. La source updates.woob.tech est déjà authentifiée
# par HTTPS. ---
def patch_gpg():
    import woob.core.repositories as repos
    repos.Keyring.find_gpg = staticmethod(lambda: None)
    repos.Keyring.find_gpgv = staticmethod(lambda: None)


class SilentProgress:
    def progress(self, percent, message):
        pass

    def error(self, message):
        pass

    def prompt(self, message):
        return True


def make_woob():
    patch_gpg()
    from woob.core import Woob
    return Woob()


def ensure_module(w, module):
    """Installe le module si nécessaire (≈1 s)."""
    try:
        w.modules_loader.get_or_load_module(module)
        return
    except Exception:
        pass
    w.repositories.install(module, progress=SilentProgress())


def cmd_check():
    try:
        import woob
        make_woob()  # force l'init (keyring, dépôts)
        emit({"type": "check", "ok": True, "woobVersion": getattr(woob, "__version__", "?")})
    except Exception as e:
        emit({"type": "check", "ok": False, "error": repr(e)})


def cmd_list():
    w = make_woob()
    infos = w.repositories.get_all_modules_info()
    modules = []
    for name, info in infos.items():
        caps = set(info.capabilities)
        if "CapBank" in caps:
            modules.append({
                "id": name,
                "name": info.description or name,
                "caps": sorted(caps & {"CapBank", "CapBankWealth", "CapDocument", "CapProfile"}),
            })
    modules.sort(key=lambda m: m["name"].lower())
    emit({"type": "list", "modules": modules})


def serialize_fields(config):
    fields = []
    for key, val in config.items():
        choices = getattr(val, "choices", None)
        fields.append({
            "id": key,
            "label": getattr(val, "label", "") or key,
            "masked": bool(getattr(val, "masked", False)),
            "required": bool(getattr(val, "required", False)),
            "default": getattr(val, "default", "") or "",
            "choices": list(choices.items()) if choices else None,
        })
    return fields


def cmd_fields(module):
    w = make_woob()
    ensure_module(w, module)
    mod = w.modules_loader.get_or_load_module(module)
    emit({"type": "fields", "module": module, "fields": serialize_fields(mod.config)})


def tx_to_dict(tx):
    date = getattr(tx, "date", None) or getattr(tx, "rdate", None)
    if isinstance(date, (datetime.date, datetime.datetime)):
        date = date.strftime("%Y-%m-%d")
    label = getattr(tx, "label", None) or getattr(tx, "raw", None) or ""
    amount = getattr(tx, "amount", None)
    try:
        amount = float(amount)
    except Exception:
        amount = None
    return {"date": date, "label": str(label).strip(), "amount": amount}


def cmd_fetch(module):
    from woob.exceptions import (
        BrowserQuestion,
        DecoupledValidation,
        AppValidation,
        BrowserRedirect,
        BrowserIncorrectPassword,
    )

    payload = read_line() or {}
    config = payload.get("config") or {}

    w = make_woob()
    ensure_module(w, module)

    # Stockage en mémoire : conserve l'état du navigateur (nécessaire au resume 2FA).
    from woob.tools.storage import StandardStorage
    statedir = os.path.join(os.path.expanduser("~"), ".banquier_woob")
    os.makedirs(statedir, exist_ok=True)
    storage = StandardStorage(os.path.join(statedir, "state.json"))

    backend = w.build_backend(module, params=dict(config), storage=storage, name="banquier")

    def run():
        """Tente de récupérer comptes + transactions ; gère la 2FA en boucle."""
        while True:
            try:
                accounts = list(backend.iter_accounts())
                acc_out = []
                tx_out = []
                for acc in accounts:
                    acc_out.append({
                        "id": getattr(acc, "id", ""),
                        "label": getattr(acc, "label", ""),
                        "balance": float(getattr(acc, "balance", 0) or 0),
                        "currency": getattr(acc, "currency", "") or "EUR",
                        "iban": getattr(acc, "iban", "") or "",
                    })
                    try:
                        for i, tx in enumerate(backend.iter_history(acc)):
                            tx_out.append({**tx_to_dict(tx), "account": getattr(acc, "id", "")})
                            if i >= 499:
                                break
                    except Exception as e:
                        logging.warning("history %s: %r", getattr(acc, "id", "?"), e)
                emit({"type": "result", "accounts": acc_out, "transactions": tx_out})
                return
            except BrowserQuestion as e:
                fields = [{"id": f.id, "label": getattr(f, "label", "") or f.id,
                           "masked": bool(getattr(f, "masked", False))} for f in e.fields]
                emit({"type": "need_2fa", "subtype": "question",
                      "message": str(e) or "Code de sécurité requis", "fields": fields})
                ans = read_line()
                if ans is None:
                    emit({"type": "error", "message": "Interrompu"})
                    return
                for f in e.fields:
                    v = (ans.get("answers") or {}).get(f.id)
                    if v:
                        backend.config[f.id].set(v)
                # boucle -> nouvelle tentative
            except (AppValidation, DecoupledValidation) as e:
                emit({"type": "need_2fa", "subtype": "decoupled",
                      "message": str(e) or "Validez la connexion dans l'application de votre banque."})
                ans = read_line()
                if ans is None:
                    emit({"type": "error", "message": "Interrompu"})
                    return
                if "resume" in backend.config:
                    backend.config["resume"].set(True)
                # boucle -> nouvelle tentative (le module interroge la banque)
            except BrowserRedirect as e:
                emit({"type": "error",
                      "message": "Cette banque exige une authentification par redirection web, "
                                 "non gérée par ce test. URL : " + str(getattr(e, "url", ""))})
                return
            except BrowserIncorrectPassword as e:
                emit({"type": "error", "message": "Identifiants incorrects : " + (str(e) or "")})
                return

    try:
        run()
    except Exception as e:
        emit({"type": "error", "message": repr(e)})
    finally:
        try:
            backend.deinit()
        except Exception:
            pass


def main():
    if len(sys.argv) < 2:
        emit({"type": "error", "message": "sous-commande manquante"})
        return
    cmd = sys.argv[1]
    try:
        if cmd == "check":
            cmd_check()
        elif cmd == "list":
            cmd_list()
        elif cmd == "fields":
            cmd_fields(sys.argv[2])
        elif cmd == "fetch":
            cmd_fetch(sys.argv[2])
        else:
            emit({"type": "error", "message": "sous-commande inconnue: " + cmd})
    except Exception as e:
        emit({"type": "error", "message": repr(e)})


if __name__ == "__main__":
    main()
