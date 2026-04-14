"use client";

import { useRef } from "react";
import { Camera } from "@phosphor-icons/react";
import { Pencil } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { cn, getInitials } from "@/lib/utils";
import { isPremium, type Profile } from "@/types/database";

interface ProfileHeaderProps {
  profile: Profile;
  isOwner: boolean;
  onAvatarUpload?: (file: File) => Promise<void>;
  onBioEdit?: () => void;
}

export function ProfileHeader({
  profile,
  isOwner,
  onAvatarUpload,
  onBioEdit,
}: ProfileHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => {
    if (isOwner && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAvatarUpload) {
      await onAvatarUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="relative">
      {/* Neumorphic background header */}
      <div className="h-24 md:h-32 bg-background shadow-neu-inset rounded-t-2xl" />

      <div className="px-4 md:px-6 pb-6">
        {/* Avatar section */}
        <div className="flex flex-col md:flex-row md:items-end gap-4 -mt-12 md:-mt-16">
          <div className="relative mx-auto md:mx-0">
            <Avatar
              className={cn(
                "h-24 w-24 md:h-32 md:w-32 border-4 border-background shadow-neu-raised",
                isOwner && "cursor-pointer group"
              )}
              onClick={handleAvatarClick}
            >
              <AvatarImage
                src={profile.avatar_url || undefined}
                alt={profile.display_name || profile.username}
              />
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl md:text-3xl font-semibold">
                {getInitials(profile.display_name || profile.username)}
              </AvatarFallback>
            </Avatar>

            {isOwner && (
              <>
                <button
                  onClick={handleAvatarClick}
                  className="absolute bottom-1 right-1 bg-primary text-primary-foreground p-2 rounded-full shadow-lg hover:bg-primary/90 transition-colors"
                >
                  <Camera className="h-4 w-4" weight="fill" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </>
            )}
          </div>

          {/* Name and info section */}
          <div className="flex-1 text-center md:text-left md:pb-2">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <h1 className="text-2xl md:text-3xl font-bold font-display text-foreground">
                {profile.display_name || profile.username}
              </h1>
              {isPremium(profile) && <PremiumBadge size="sm" />}
            </div>
            <p className="text-muted-foreground">@{profile.username}</p>
          </div>
        </div>

        {/* Bio section */}
        <div className="mt-4">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              {profile.bio ? (
                <p className="text-foreground text-center md:text-left">{profile.bio}</p>
              ) : isOwner ? (
                <p className="text-muted-foreground text-center md:text-left italic">
                  No bio yet
                </p>
              ) : null}
            </div>
            {isOwner && onBioEdit && (
              <button
                onClick={onBioEdit}
                className="flex-shrink-0 p-1.5 rounded-full hover:bg-muted transition-colors"
                aria-label="Edit bio"
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
