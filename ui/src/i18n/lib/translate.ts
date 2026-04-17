import { en } from "../locales/en.ts";
import { pt_BR } from "../locales/pt-BR.ts";
import { zh_CN } from "../locales/zh-CN.ts";
import { zh_TW } from "../locales/zh-TW.ts";
import type { Locale, TranslationMap } from "./types.ts";

type Subscriber = (locale: Locale) => void;

export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ["en", "zh-CN", "zh-TW", "pt-BR"];

const BUILTIN_TRANSLATIONS: Record<Locale, TranslationMap> = {
  en,
  "pt-BR": pt_BR,
  "zh-CN": zh_CN,
  "zh-TW": zh_TW,
};

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && SUPPORTED_LOCALES.includes(value as Locale);
}

class I18nManager {
  private locale: Locale = "en";
  private translations: Record<Locale, TranslationMap> = { ...BUILTIN_TRANSLATIONS };
  private subscribers: Set<Subscriber> = new Set();

  constructor() {
    this.loadLocale();
  }

  private resolveInitialLocale(): Locale {
    const saved = localStorage.getItem("openclaw.i18n.locale");
    if (isSupportedLocale(saved)) {
      return saved;
    }
    const navLang = navigator.language;
    if (navLang.startsWith("zh")) {
      return navLang === "zh-TW" || navLang === "zh-HK" ? "zh-TW" : "zh-CN";
    }
    if (navLang.startsWith("pt")) {
      return "pt-BR";
    }
    return "en";
  }

  private loadLocale() {
    this.locale = this.resolveInitialLocale();
    this.ensureLocaleLoaded(this.locale);
  }

  private ensureLocaleLoaded(locale: Locale) {
    if (!this.translations[locale]) {
      this.translations[locale] = BUILTIN_TRANSLATIONS[locale];
    }
  }

  private syncLocaleFromStorage() {
    const saved = localStorage.getItem("openclaw.i18n.locale");
    if (isSupportedLocale(saved) && saved !== this.locale) {
      this.locale = saved;
      this.ensureLocaleLoaded(saved);
    }
  }

  public getLocale(): Locale {
    this.syncLocaleFromStorage();
    return this.locale;
  }

  public async setLocale(locale: Locale) {
    const changed = this.locale !== locale;
    const hadTranslation = Boolean(this.translations[locale]);
    this.ensureLocaleLoaded(locale);
    if (!changed && hadTranslation) {
      return;
    }

    this.locale = locale;
    localStorage.setItem("openclaw.i18n.locale", locale);
    this.notify();
  }

  public registerTranslation(locale: Locale, map: TranslationMap) {
    this.translations[locale] = map;
  }

  public subscribe(sub: Subscriber) {
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  private notify() {
    this.subscribers.forEach((sub) => sub(this.locale));
  }

  public t(key: string, params?: Record<string, string>): string {
    this.syncLocaleFromStorage();
    const keys = key.split(".");
    let value: unknown = this.translations[this.locale] || this.translations["en"];

    for (const k of keys) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[k];
      } else {
        value = undefined;
        break;
      }
    }

    // Fallback to English
    if (value === undefined && this.locale !== "en") {
      value = this.translations["en"];
      for (const k of keys) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[k];
        } else {
          value = undefined;
          break;
        }
      }
    }

    if (typeof value !== "string") {
      return key;
    }

    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, k) => params[k] || `{${k}}`);
    }

    return value;
  }
}

export const i18n = new I18nManager();
export const t = (key: string, params?: Record<string, string>) => i18n.t(key, params);
