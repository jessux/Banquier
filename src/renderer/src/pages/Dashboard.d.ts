import type { Page } from '../App';
export default function Dashboard({ onNavigate }: {
    onNavigate?: (page: Page, opts?: {
        uncategorized?: boolean;
    }) => void;
}): JSX.Element;
