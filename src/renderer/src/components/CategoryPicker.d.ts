interface Props {
    value: string;
    onChange: (v: string) => void;
    categories: string[];
    onConfirm?: () => void;
    onCancel?: () => void;
    inputRef?: React.RefObject<HTMLInputElement>;
    style?: React.CSSProperties;
    placeholder?: string;
}
export default function CategoryPicker({ value, onChange, categories, onConfirm, onCancel, inputRef, style, placeholder }: Props): JSX.Element;
export {};
