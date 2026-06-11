"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDownIcon, LogOutIcon, UserIcon } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { FaDiscord } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={label}
          className="group/account bg-card/70 hover:bg-muted focus-visible:ring-ring/50 data-popup-open:bg-muted flex items-center gap-1 rounded-lg border py-0.5 pr-1.5 pl-0.5 transition-colors outline-none focus-visible:ring-3"
        >
          <Avatar size="sm">
            <AvatarImage src={user.image ?? undefined} alt="" />
            <AvatarFallback>{label.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <ChevronDownIcon className="text-muted-foreground size-4 transition-transform group-data-popup-open/account:rotate-180" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="w-auto min-w-44"
        >
          <DropdownMenuLabel className="text-foreground truncate text-sm font-medium">
            {label}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/account" />}>
            <UserIcon />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
  open,
  onOpenChange,
}: {
  children?: ReactNode;
  callbackUrl?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children !== undefined && (
        <DialogTrigger
          className={cn(
            "group/button border-border bg-background hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 sm:px-2.5",
            triggerClassName,
          )}
        >
          {children}
        </DialogTrigger>
      )}
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
