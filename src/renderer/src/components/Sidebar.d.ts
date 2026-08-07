import type { Page } from '../App';
interface Props {
    activePage: Page;
    onNavigate: (page: Page) => void;
}
export default function Sidebar({ activePage, onNavigate }: Props): JSX.Element;
export {};
