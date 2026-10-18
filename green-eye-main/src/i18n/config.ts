import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import mr from "./locales/mr.json";

// Central place to register a new language later: add the JSON file above,
// then add one line here. Nothing else in the app needs to change.
export const SUPPORTED_LANGUAGES = {
  en: { label: "English", nativeLabel: "English" },
  hi: { label: "Hindi", nativeLabel: "हिन्दी" },
  mr: { label: "Marathi", nativeLabel: "मराठी" },
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      mr: { translation: mr },
    },
    fallbackLng: "en",
    supportedLngs: Object.keys(SUPPORTED_LANGUAGES),
    interpolation: { escapeValue: false },
    detection: {
      // Remember the user's choice (localStorage) before falling back to
      // the browser's own language, so we don't re-ask every visit.
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "agrolens_language",
      caches: ["localStorage"],
    },
  });

export default i18n;
