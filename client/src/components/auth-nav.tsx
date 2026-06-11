"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { LogOutIcon } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { FaDiscord } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";

interface AuthNavProps {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function AuthNav({ user }: AuthNavProps) {
  if (user) {
    const label = user.name ?? user.email ?? "Signed in";

    return (
      <div className="flex items-center gap-1.5">
        <div className="bg-card/70 hidden max-w-36 items-center gap-2 rounded-lg border px-2 py-1 sm:flex">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={24}
              height={24}
              className="size-6 rounded-full"
            />
          ) : (
            <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full text-xs font-semibold">
              {label.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="truncate text-sm font-medium">{label}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Sign out"
          onClick={() => void signOut({ callbackUrl: "/" })}
        >
          <LogOutIcon />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    );
  }

  return (
    <LoginDialog>
      <span className="hidden min-[420px]:inline">Login</span>
    </LoginDialog>
  );
}

export function LoginDialog({
  children,
  callbackUrl = "/",
  triggerClassName,
}: {
  children: ReactNode;
  callbackUrl?: string;
  triggerClassName?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          "group/button border-border bg-background hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 sm:px-2.5",
          triggerClassName,
        )}
      >
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Login</DialogTitle>
          <DialogDescription>Choose an OAuth provider.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <OAuthButton
            label="Continue with Google"
            icon={<FcGoogle className="size-5" />}
            onClick={() => void signIn("google", { callbackUrl })}
          />
          <OAuthButton
            label="Continue with Discord"
            icon={<FaDiscord className="size-5 text-[#5865F2]" />}
            onClick={() => void signIn("discord", { callbackUrl })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OAuthButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="h-11 w-full justify-start gap-3 px-3"
      onClick={onClick}
    >
      <span className="flex size-6 items-center justify-center">{icon}</span>
      <span>{label}</span>
    </Button>
  );
}
