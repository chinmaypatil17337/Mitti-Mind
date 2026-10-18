import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/i18n/config";

interface LanguageSwitcherProps {
  /** "icon" for a compact header control, "full" for a labeled settings-page control. */
  variant?: "icon" | "full";
}

/**
 * Lets the user pick English / Hindi / Marathi. The choice is written to
 * localStorage by i18next-browser-languagedetector (see src/i18n/config.ts),
 * so it's remembered on the next visit without asking again. The chatbot
 * reads the same i18n.language value to answer in the matching language.
 */
export const LanguageSwitcher = ({ variant = "icon" }: LanguageSwitcherProps) => {
  const { i18n, t } = useTranslation();

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <Select value={i18n.resolvedLanguage ?? "en"} onValueChange={changeLanguage}>
      <SelectTrigger
        aria-label={t("settings.language")}
        className={variant === "icon" ? "w-[130px] gap-1.5 border-0 bg-muted" : "w-[180px]"}
      >
        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(SUPPORTED_LANGUAGES) as LanguageCode[]).map((code) => (
          <SelectItem key={code} value={code}>
            {SUPPORTED_LANGUAGES[code].nativeLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
