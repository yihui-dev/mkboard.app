import { Popover } from "@heroui/react";
import { Check, ChevronDown, Languages } from "lucide-react";
import type { Locale } from "../lib/i18n";

type Props = {
  locale: Locale;
  label: string;
  zhLabel: string;
  enLabel: string;
  zhHref: string;
  enHref: string;
};

export function LanguageMenu({ locale, label, zhLabel, enLabel, zhHref, enHref }: Props) {
  const options = [
    { locale: "zh" as const, label: zhLabel, href: zhHref, lang: "zh-CN" },
    { locale: "en" as const, label: enLabel, href: enHref, lang: "en" }
  ];
  const currentLabel = locale === "en" ? enLabel : zhLabel;

  return (
    <Popover.Root>
      <Popover.Trigger className="language-menu-trigger" aria-label={label}>
        <Languages className="language-menu-icon" aria-hidden="true" />
        <span>{currentLabel}</span>
        <ChevronDown className="language-menu-chevron" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Content className="language-menu-popover" placement="bottom end" offset={10}>
        <Popover.Dialog className="language-menu-dialog" aria-label={label}>
          <div className="language-menu-list">
            {options.map((option) => {
              const active = option.locale === locale;
              return (
                <a className={`language-menu-option ${active ? "is-active" : ""}`} href={option.href} hrefLang={option.lang} lang={option.lang} aria-current={active ? "page" : undefined} key={option.locale}>
                  <span>{option.label}</span>
                  {active ? <Check className="language-menu-check" aria-hidden="true" /> : null}
                </a>
              );
            })}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover.Root>
  );
}
