import type { Settings } from '../../../shared/types';
interface Props {
    settings: Settings;
    onDone: (saved: Partial<Settings>) => void;
    onNavigate: (page: string) => void;
}
export default function OnboardingModal({ settings, onDone, onNavigate }: Props): JSX.Element;
export {};
