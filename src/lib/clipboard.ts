/**
 * Clipboard Utility
 * 
 * Handles copying text to clipboard with fallback for non-secure contexts (HTTP)
 * where navigator.clipboard might be unavailable.
 */
import { toast } from "@/hooks/use-toast";

export async function copyToClipboard(text: string, title: string = "Copied", description: string = "Copied to clipboard"): Promise<boolean> {
    if (!text) return false;

    try {
        // Try Modern API first
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            toast({ title, description });
            return true;
        }
    } catch (err) {
        console.warn("Clipboard API failed, trying fallback...", err);
    }

    // Fallback for HTTP / Older Browsers
    let textArea: HTMLTextAreaElement | null = null;
    try {
        textArea = document.createElement("textarea");
        textArea.value = text;

        // Ensure it's not visible but part of DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);

        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');

        if (successful) {
            toast({ title, description });
            return true;
        }
    } catch (err) {
        console.error("Fallback clipboard failed", err);
    } finally {
        if (textArea?.parentNode) {
            textArea.parentNode.removeChild(textArea);
        }
    }

    toast({
        title: "Copy Failed",
        description: "Could not copy text. Please copy manually.",
        variant: "destructive"
    });
    return false;
}
