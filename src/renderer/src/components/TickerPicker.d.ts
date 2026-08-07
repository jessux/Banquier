import type { AssetType, SymbolSuggestion } from '../../../shared/types';
interface Props {
    type: AssetType;
    value: string;
    onChange: (symbol: string) => void;
    onSelect?: (s: SymbolSuggestion) => void;
    placeholder?: string;
}
export default function TickerPicker({ type, value, onChange, onSelect, placeholder }: Props): JSX.Element;
export {};
