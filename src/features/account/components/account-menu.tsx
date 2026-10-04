"use client";

import Link from "next/link";
import {
  CaretUpDownIcon,
  UserIcon,
  UsersIcon,
  SignOutIcon,
} from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useSession } from "@/features/auth/client/queries";

export function AccountMenu() {
  const session = useSession();
  const user = session.data?.user;
  const name = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
    : session.isPending
      ? "Loading account…"
      : "Sign in";
  const email =
    user?.email ||
    (session.error ? "Account unavailable" : "Manage your account");
  const initials = user
    ? [user.firstName, user.lastName]
        .filter(Boolean)
        .map((part) => part!.slice(0, 1))
        .join("") || user.email.slice(0, 1).toUpperCase()
    : "?";
  const avatar = (size: string) => (
    <Avatar className={size}>
      <AvatarImage src={user?.profilePictureUrl || undefined} alt={name} />
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );

  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" className="profile-button" />}
        aria-label="Open profile menu"
      >
        {avatar("size-8 shrink-0")}
        <span className="account-identity">
          <strong className="truncate">{name}</strong>
          <small className="truncate">{email}</small>
        </span>
        <CaretUpDownIcon aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup side="top" align="start" className="account-menu-popup">
        <div className="account-menu-identity">
          {avatar("size-9 shrink-0")}
          <div>
            <strong>{name}</strong>
            <p>{email}</p>
          </div>
        </div>
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/settings/profile" />}>
          <UserIcon aria-hidden="true" />
          Profile
        </MenuLinkItem>
        <MenuLinkItem render={<Link href="/settings/team" />}>
          <UsersIcon aria-hidden="true" />
          Team settings
        </MenuLinkItem>
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/settings/github" />}>
          GitHub connections
        </MenuLinkItem>
        {user ? (
          <form action="/api/auth/logout" method="post">
            <MenuItem
              render={<button type="submit" />}
              className="w-full"
              nativeButton
              closeOnClick={false}
            >
              <SignOutIcon aria-hidden="true" />
              Log out
            </MenuItem>
          </form>
        ) : (
          <MenuLinkItem render={<Link href="/login" />}>Sign in</MenuLinkItem>
        )}
      </MenuPopup>
    </Menu>
  );
}
