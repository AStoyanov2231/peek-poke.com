import { MapPin, MapPinned, Mail, MailOpen, User, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  icon: LucideIcon;
  activeIcon: LucideIcon;
  label: string;
  badge?: boolean;
};

export const navItems: NavItem[] = [
  { href: "/", icon: MapPin, activeIcon: MapPinned, label: "Map" },
  { href: "/inbox", icon: Mail, activeIcon: MailOpen, label: "Inbox", badge: true },
  { href: "/profile", icon: User, activeIcon: User, label: "Profile" },
];
