import ShellFooter from '../../../components/shell/ShellFooter';
import { useAppContext } from '../../../context/AppContext';

export default function Footer() {
    const { isHeaderSuppressed } = useAppContext();

    if (isHeaderSuppressed) {
        return null;
    }

    return <ShellFooter variant="app" />;
}
