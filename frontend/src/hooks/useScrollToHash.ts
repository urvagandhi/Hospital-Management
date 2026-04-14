import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls to #hash targets on page load/navigation.
 * React Router doesn't do this by default. Paired with `scroll-mt-*` on
 * anchored elements so headers clear the fixed navbar.
 */
export function useScrollToHash() {
    const { hash, pathname } = useLocation();
    useEffect(() => {
        if (!hash) return;
        const id = hash.replace(/^#/, "");
        const el = document.getElementById(id);
        if (el) {
            // Next tick so layout has settled (especially on first render)
            setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        }
    }, [hash, pathname]);
}
