'use client';

import { AlertTriangle, Bell, ChevronRight, Clock, ExternalLink, Loader2, TestTube } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type TelegramAnnouncementPanelAudience =
  | 'ACTIVE_USERS'
  | 'STANDARD_USERS'
  | 'PREMIUM_USERS'
  | 'TRIAL_USERS';

type TelegramAnnouncementType =
  | 'INFO'
  | 'ANNOUNCEMENT'
  | 'PROMO'
  | 'NEW_SERVER'
  | 'MAINTENANCE';

type TelegramAnnouncementCardStyle = 'DEFAULT' | 'PROMO' | 'PREMIUM' | 'OPERATIONS';
type TelegramAnnouncementRecurrenceType = 'NONE' | 'DAILY' | 'WEEKLY';

type AnnouncementTargetOptions = {
  tags: Array<{ value: string; count: number }>;
  segments: Array<{ value: string; count: number }>;
  servers: Array<{ value: string; label: string; countryCode?: string | null; count: number }>;
  regions: Array<{ value: string; count: number }>;
};

type AnnouncementBroadcastsUi = {
  announcementTitle: string;
  announcementDesc: string;
  announcementAudience: string;
  recipientsLabel: string;
  announcementType: string;
  announcementSubject: string;
  announcementBody: string;
  announcementCardStyle: string;
  announcementRecurrence: string;
  announcementOneTime: string;
  announcementDaily: string;
  announcementWeekly: string;
  announcementTargetTag: string;
  announcementAllTargets: string;
  announcementTargetServer: string;
  announcementTargetRegion: string;
  announcementHeroImage: string;
  announcementHeroImageHint: string;
  announcementScheduleAt: string;
  announcementScheduleHint: string;
  includeSupportButton: string;
  announcementPinToInbox: string;
  announcementPinToInboxHint: string;
  announcementCardPreview: string;
  announcementCardPreviewDesc: string;
  announcementPreviewSelf: string;
  sendAnnouncementNow: string;
  announcementScheduleNow: string;
};

type AnnouncementBroadcastsTabProps = {
  ui: AnnouncementBroadcastsUi;
  isMyanmar: boolean;
  hasToken: boolean;
  canManageAnnouncements: boolean;
  audience: TelegramAnnouncementPanelAudience;
  audienceCount: number;
  audienceCountLoading: boolean;
  type: TelegramAnnouncementType;
  title: string;
  message: string;
  cardStyle: TelegramAnnouncementCardStyle;
  recurrenceType: TelegramAnnouncementRecurrenceType;
  targetTag: string;
  targetSegment: string;
  targetServerId: string;
  targetCountryCode: string;
  heroImageUrl: string;
  scheduledFor: string;
  includeSupportButton: boolean;
  pinToInbox: boolean;
  targetOptions: AnnouncementTargetOptions;
  previewPending: boolean;
  sendPending: boolean;
  onAudienceChange: (value: TelegramAnnouncementPanelAudience) => void;
  onTypeChange: (value: TelegramAnnouncementType) => void;
  onTitleChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onCardStyleChange: (value: TelegramAnnouncementCardStyle) => void;
  onRecurrenceTypeChange: (value: TelegramAnnouncementRecurrenceType) => void;
  onTargetTagChange: (value: string) => void;
  onTargetSegmentChange: (value: string) => void;
  onTargetServerIdChange: (value: string) => void;
  onTargetCountryCodeChange: (value: string) => void;
  onHeroImageUrlChange: (value: string) => void;
  onScheduledForChange: (value: string) => void;
  onIncludeSupportButtonChange: (value: boolean) => void;
  onPinToInboxChange: (value: boolean) => void;
  onPreviewSelf: () => void;
  onSendNow: () => void;
  onSchedule: () => void;
  getAnnouncementCardStyleLabel: (
    cardStyle: TelegramAnnouncementCardStyle,
    isMyanmar: boolean,
  ) => string;
  getAnnouncementRecurrenceLabel: (
    recurrenceType: TelegramAnnouncementRecurrenceType,
    isMyanmar: boolean,
  ) => string;
  getAnnouncementSegmentLabel: (segment: string, isMyanmar: boolean) => string;
  getAnnouncementCardPreviewClass: (cardStyle: TelegramAnnouncementCardStyle) => string;
};

export function AnnouncementBroadcastsTab({
  ui,
  isMyanmar,
  hasToken,
  canManageAnnouncements,
  audience,
  audienceCount,
  audienceCountLoading,
  type,
  title,
  message,
  cardStyle,
  recurrenceType,
  targetTag,
  targetSegment,
  targetServerId,
  targetCountryCode,
  heroImageUrl,
  scheduledFor,
  includeSupportButton,
  pinToInbox,
  targetOptions,
  previewPending,
  sendPending,
  onAudienceChange,
  onTypeChange,
  onTitleChange,
  onMessageChange,
  onCardStyleChange,
  onRecurrenceTypeChange,
  onTargetTagChange,
  onTargetSegmentChange,
  onTargetServerIdChange,
  onTargetCountryCodeChange,
  onHeroImageUrlChange,
  onScheduledForChange,
  onIncludeSupportButtonChange,
  onPinToInboxChange,
  onPreviewSelf,
  onSendNow,
  onSchedule,
  getAnnouncementCardStyleLabel,
  getAnnouncementRecurrenceLabel,
  getAnnouncementSegmentLabel,
  getAnnouncementCardPreviewClass,
}: AnnouncementBroadcastsTabProps) {
  return (
    <TabsContent value="broadcasts" className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-background/75 p-4 dark:bg-white/[0.02]">
        <div className="space-y-1">
          <p className="text-sm font-medium">{ui.announcementTitle}</p>
          <p className="text-xs text-muted-foreground">{ui.announcementDesc}</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{ui.announcementAudience}</Label>
            <Select value={audience} onValueChange={onAudienceChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE_USERS">{isMyanmar ? 'Active Telegram users' : 'Active Telegram users'}</SelectItem>
                <SelectItem value="STANDARD_USERS">{isMyanmar ? 'Standard key users' : 'Standard key users'}</SelectItem>
                <SelectItem value="PREMIUM_USERS">{isMyanmar ? 'Premium users' : 'Premium users'}</SelectItem>
                <SelectItem value="TRIAL_USERS">{isMyanmar ? 'Trial users' : 'Trial users'}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ui.recipientsLabel}: {audienceCountLoading ? '…' : audienceCount}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{ui.announcementType}</Label>
            <Select value={type} onValueChange={onTypeChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INFO">{isMyanmar ? 'Information' : 'Information'}</SelectItem>
                <SelectItem value="ANNOUNCEMENT">{isMyanmar ? 'Announcement' : 'Announcement'}</SelectItem>
                <SelectItem value="PROMO">{isMyanmar ? 'Discount / Promo' : 'Discount / Promo'}</SelectItem>
                <SelectItem value="NEW_SERVER">{isMyanmar ? 'New server' : 'New server'}</SelectItem>
                <SelectItem value="MAINTENANCE">{isMyanmar ? 'Maintenance' : 'Maintenance'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <Label htmlFor="telegram-announcement-title">{ui.announcementSubject}</Label>
          <Input
            id="telegram-announcement-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder={isMyanmar ? 'ဥပမာ - New SG server is ready' : 'Example: New SG server is ready'}
          />
        </div>
        <div className="mt-3 space-y-2">
          <Label htmlFor="telegram-announcement-message">{ui.announcementBody}</Label>
          <Textarea
            id="telegram-announcement-message"
            rows={5}
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder={
              isMyanmar
                ? 'အသုံးပြုသူများထံ ပို့လိုသော မက်ဆေ့ချ်ကို ဒီနေရာမှာ ရိုက်ပါ။'
                : 'Write the manual message you want to send to users here.'
            }
          />
        </div>

        <Collapsible className="mt-4 rounded-2xl border border-border/60 bg-background/55 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Advanced targeting and presentation</p>
              <p className="text-xs text-muted-foreground">
                Card style, targeting, scheduling, inbox pinning, and image presentation.
              </p>
            </div>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                Show options
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{ui.announcementCardStyle}</Label>
                <Select value={cardStyle} onValueChange={onCardStyleChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEFAULT">{getAnnouncementCardStyleLabel('DEFAULT', isMyanmar)}</SelectItem>
                    <SelectItem value="PROMO">{getAnnouncementCardStyleLabel('PROMO', isMyanmar)}</SelectItem>
                    <SelectItem value="PREMIUM">{getAnnouncementCardStyleLabel('PREMIUM', isMyanmar)}</SelectItem>
                    <SelectItem value="OPERATIONS">{getAnnouncementCardStyleLabel('OPERATIONS', isMyanmar)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{ui.announcementRecurrence}</Label>
                <Select value={recurrenceType} onValueChange={onRecurrenceTypeChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">{ui.announcementOneTime}</SelectItem>
                    <SelectItem value="DAILY">{ui.announcementDaily}</SelectItem>
                    <SelectItem value="WEEKLY">{ui.announcementWeekly}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>{ui.announcementTargetTag}</Label>
                <Select value={targetTag} onValueChange={onTargetTagChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{ui.announcementAllTargets}</SelectItem>
                    {targetOptions.tags.map((tag) => (
                      <SelectItem key={tag.value} value={tag.value}>{tag.value} ({tag.count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isMyanmar ? 'Customer segment' : 'Customer segment'}</Label>
                <Select value={targetSegment} onValueChange={onTargetSegmentChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{ui.announcementAllTargets}</SelectItem>
                    {targetOptions.segments.map((segment) => (
                      <SelectItem key={segment.value} value={segment.value}>
                        {getAnnouncementSegmentLabel(segment.value, isMyanmar)} ({segment.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{ui.announcementTargetServer}</Label>
                <Select value={targetServerId} onValueChange={onTargetServerIdChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{ui.announcementAllTargets}</SelectItem>
                    {targetOptions.servers.map((server) => (
                      <SelectItem key={server.value} value={server.value}>
                        {server.label}
                        {server.countryCode ? ` (${server.countryCode})` : ''} ({server.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{ui.announcementTargetRegion}</Label>
                <Select value={targetCountryCode} onValueChange={onTargetCountryCodeChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{ui.announcementAllTargets}</SelectItem>
                    {targetOptions.regions.map((region) => (
                      <SelectItem key={region.value} value={region.value}>{region.value} ({region.count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="telegram-announcement-hero-image">{ui.announcementHeroImage}</Label>
                <Input
                  id="telegram-announcement-hero-image"
                  value={heroImageUrl}
                  onChange={(event) => onHeroImageUrlChange(event.target.value)}
                  placeholder="https://example.com/promo-banner.jpg"
                />
                <p className="text-xs text-muted-foreground">{ui.announcementHeroImageHint}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="telegram-announcement-scheduled-for">{ui.announcementScheduleAt}</Label>
                <Input
                  id="telegram-announcement-scheduled-for"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => onScheduledForChange(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{ui.announcementScheduleHint}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/55 p-3">
                <div>
                  <p className="text-sm font-medium">{ui.includeSupportButton}</p>
                  <p className="text-xs text-muted-foreground">
                    Adds the configured support link as an inline button when available.
                  </p>
                </div>
                <Switch checked={includeSupportButton} onCheckedChange={onIncludeSupportButtonChange} />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/55 p-3">
                <div>
                  <p className="text-sm font-medium">{ui.announcementPinToInbox}</p>
                  <p className="text-xs text-muted-foreground">{ui.announcementPinToInboxHint}</p>
                </div>
                <Switch checked={pinToInbox} onCheckedChange={onPinToInboxChange} />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="mt-4 rounded-2xl border border-border/60 bg-background/55 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">{ui.announcementCardPreview}</p>
            <p className="text-xs text-muted-foreground">{ui.announcementCardPreviewDesc}</p>
          </div>
          <div className={cn('mt-3 overflow-hidden rounded-2xl border p-4', getAnnouncementCardPreviewClass(cardStyle))}>
            {heroImageUrl.trim() ? (
              <div className="mb-3 overflow-hidden rounded-xl border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={heroImageUrl.trim()} alt={title.trim() || 'Announcement preview'} className="h-36 w-full object-cover" />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{getAnnouncementCardStyleLabel(cardStyle, isMyanmar)}</Badge>
              <Badge variant="outline">{type}</Badge>
              <Badge variant="outline">{getAnnouncementRecurrenceLabel(recurrenceType, isMyanmar)}</Badge>
              {pinToInbox ? <Badge variant="secondary">Pinned</Badge> : null}
            </div>
            <p className="mt-3 text-lg font-semibold">
              {title.trim() || (isMyanmar ? 'Announcement title preview' : 'Announcement title preview')}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {message.trim()
                || (isMyanmar
                  ? 'Telegram အသုံးပြုသူများထံ ပို့မည့် message preview ကို ဒီနေရာမှာ ကြည့်နိုင်ပါသည်။'
                  : 'This is where the branded Telegram announcement preview appears.')}
            </p>
          </div>
        </div>

        {!canManageAnnouncements ? (
          <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Only Owner/Admin scoped accounts can send Telegram announcements from the panel.
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="rounded-full"
            onClick={onPreviewSelf}
            disabled={
              !hasToken
              || !canManageAnnouncements
              || previewPending
              || title.trim().length < 3
              || message.trim().length < 10
            }
          >
            {previewPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
            {ui.announcementPreviewSelf}
          </Button>
          <Button
            type="button"
            className="rounded-full"
            onClick={onSendNow}
            disabled={
              !hasToken
              || !canManageAnnouncements
              || sendPending
              || title.trim().length < 3
              || message.trim().length < 10
              || audienceCount === 0
            }
          >
            {sendPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
            {ui.sendAnnouncementNow}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={onSchedule}
            disabled={
              !hasToken
              || !canManageAnnouncements
              || sendPending
              || !scheduledFor
              || Number.isNaN(new Date(scheduledFor).getTime())
              || title.trim().length < 3
              || message.trim().length < 10
              || audienceCount === 0
            }
          >
            {sendPending && scheduledFor ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Clock className="mr-2 h-4 w-4" />
            )}
            {ui.announcementScheduleNow}
          </Button>
        </div>
      </div>
    </TabsContent>
  );
}
