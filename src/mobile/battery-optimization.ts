import { registerPlugin } from '@capacitor/core'

/**
 * Pont vers le plugin natif `BatteryOptimization`
 * (android/app/src/main/java/com/banquier/app/BatteryOptimizationPlugin.java).
 *
 * Android place par défaut toutes les applications dans sa liste « optimisées » :
 * le mode Doze y regroupe et repousse les réveils WorkManager, si bien que
 * l'intervalle d'une heure demandé par la surveillance Powens peut devenir
 * plusieurs heures — voire ne jamais se déclencher tant que le téléphone n'est pas
 * rebranché. L'exemption est la seule autorisation qu'Android expose pour ça, et
 * seul l'utilisateur peut l'accorder, dans une boîte de dialogue système.
 *
 * Le plugin est déclaré dans le module applicatif, pas dans node_modules : il est
 * donc enregistré à la main dans MainActivity.onCreate().
 */

export interface BatteryExemption {
  /** false sur iOS, sur desktop et dans un navigateur : la notion n'existe pas. */
  supported: boolean
  /** true quand Android a cessé d'appliquer ses restrictions d'arrière-plan. */
  granted: boolean
}

interface BatteryOptimizationPlugin {
  status(): Promise<BatteryExemption>
  request(): Promise<BatteryExemption>
  openSettings(): Promise<BatteryExemption>
}

const BatteryOptimization = registerPlugin<BatteryOptimizationPlugin>('BatteryOptimization')

const UNSUPPORTED: BatteryExemption = { supported: false, granted: false }

/** Toute la surface est tolérante à l'absence du plugin : sur iOS comme sur desktop,
 *  l'appel lève, et l'interface doit simplement ne rien proposer. */
async function safely(call: () => Promise<BatteryExemption>): Promise<BatteryExemption> {
  try {
    const result = await call()
    return { supported: result?.supported === true, granted: result?.granted === true }
  } catch (err) {
    console.warn('[battery-optimization] plugin indisponible', err)
    return { ...UNSUPPORTED }
  }
}

export function status(): Promise<BatteryExemption> {
  return safely(() => BatteryOptimization.status())
}

/** Ouvre la boîte de dialogue système. Résout avec l'état RÉEL après fermeture :
 *  plusieurs versions d'Android renvoient « annulé » alors que l'exemption vient
 *  d'être accordée, le code de retour ne sert donc à rien. */
export function request(): Promise<BatteryExemption> {
  return safely(() => BatteryOptimization.request())
}

/** Écran système listant les applications optimisées — recours quand la boîte de
 *  dialogue directe n'existe pas (ROMs sans Google Play, certaines surcouches), et
 *  seul moyen de revenir sur l'autorisation une fois donnée. */
export function openSettings(): Promise<BatteryExemption> {
  return safely(() => BatteryOptimization.openSettings())
}
