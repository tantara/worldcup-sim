"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useI18n } from "~/components/i18n/locale-provider";
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  type Locale,
} from "~/lib/i18n/config";

export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();
  const router = useRouter();

  const onSelect = (nextLocale: Locale) => {
    setLocale(nextLocale);
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("nav.language")}
            title={t("nav.language")}
          >
            <Languages className="size-5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-44">
        {SUPPORTED_LOCALES.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => onSelect(option)}
            className="justify-between"
          >
            <span>{LOCALE_LABELS[option]}</span>
            <span className="text-muted-foreground text-xs uppercase">
              {option}
            </span>
            {option === locale && <span className="sr-only">selected</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
