'use client';

import { Loader2, Save, TestTube } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/utils';

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

type AnnouncementTargetOptions = {
  tags: Array<{ value: string; count: number }>;
  segments: Array<{ value: string; count: number }>;
  servers: Array<{ value: string; label: string; countryCode?: string | null; count: number }>;
  regions: Array<{ value: string; count: number }>;
};

type AnnouncementExperimentVariantRow = {
  id: string;
  variantKey: string;
  label: string;
  allocationPercent: number;
  title: string;
  message: string;
  heroImageUrl?: string | null;
  cardStyle: TelegramAnnouncementCardStyle;
  announcements: number;
  sentCount: number;
  totalRecipients: number;
  failedCount: number;
};

type AnnouncementExperimentRow = {
  id: string;
  name: string;
  status: string;
  audience: TelegramAnnouncementPanelAudience;
  type: TelegramAnnouncementType;
  includeSupportButton: boolean;
  pinToInbox: boolean;
  createdAt: Date;
  updatedAt: Date;
  targetSegment?: string | null;
  targetServerName?: string | null;
  targetCountryCode?: string | null;
  launchedAt?: Date | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  latestAnnouncementId?: string | null;
  recentAnnouncements: Array<{
    id: string;
    status: string;
    experimentVariantKey?: string | null;
    experimentVariantLabel?: string | null;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    sentAt?: Date | null;
    createdAt: Date;
  }>;
  variants: AnnouncementExperimentVariantRow[];
};

type AnnouncementExperimentAnalytics = {
  sentCount: number;
  totalRecipients: number;
  openCount: number;
  clickCount: number;
  attributedOrders: number;
  latestAnnouncementId: string | null;
  variants: Array<{
    variantKey: string;
    sentCount: number;
    totalRecipients: number;
    attributedOrders: number;
    conversionRate: number;
  }>;
};

type AnnouncementExperimentsUi = {
  announcementExperimentsTitle: string;
  announcementExperimentsDesc: string;
  announcementExperimentCreateNew: string;
  announcementExperimentSave: string;
  announcementExperimentLaunch: string;
  announcementExperimentName: string;
  announcementAudience: string;
  announcementType: string;
  announcementExperimentSplit: string;
  announcementTargetTag: string;
  announcementTargetServer: string;
  announcementTargetRegion: string;
  announcementAllTargets: string;
  announcementExperimentVariantA: string;
  announcementExperimentVariantB: string;
  announcementSubject: string;
  announcementBody: string;
  announcementCardStyle: string;
  announcementHeroImage: string;
  includeSupportButton: string;
  announcementPinToInbox: string;
  announcementExperimentLoad: string;
  announcementExperimentJumpHistory: string;
};

type AnnouncementExperimentsPanelProps = {
  ui: AnnouncementExperimentsUi;
  isMyanmar: boolean;
  canManageAnnouncements: boolean;
  targetOptions: AnnouncementTargetOptions;
  experiments: AnnouncementExperimentRow[];
  analyticsByExperiment: Map<string, AnnouncementExperimentAnalytics>;
  experimentId: string | null;
  experimentName: string;
  experimentAudience: TelegramAnnouncementPanelAudience;
  experimentType: TelegramAnnouncementType;
  experimentTargetTag: string;
  experimentTargetSegment: string;
  experimentTargetServerId: string;
  experimentTargetCountryCode: string;
  experimentIncludeSupportButton: boolean;
  experimentPinToInbox: boolean;
  experimentVariantASplit: string;
  normalizedExperimentVariantASplit: number;
  normalizedExperimentVariantBSplit: number;
  experimentVariantATitle: string;
  experimentVariantAMessage: string;
  experimentVariantAHeroImageUrl: string;
  experimentVariantACardStyle: TelegramAnnouncementCardStyle;
  experimentVariantBTitle: string;
  experimentVariantBMessage: string;
  experimentVariantBHeroImageUrl: string;
  experimentVariantBCardStyle: TelegramAnnouncementCardStyle;
  savePending: boolean;
  launchPending: boolean;
  onReset: () => void;
  onSave: () => void;
  onLaunchCurrent: () => void;
  onExperimentNameChange: (value: string) => void;
  onExperimentAudienceChange: (value: TelegramAnnouncementPanelAudience) => void;
  onExperimentTypeChange: (value: TelegramAnnouncementType) => void;
  onExperimentVariantASplitChange: (value: string) => void;
  onExperimentTargetTagChange: (value: string) => void;
  onExperimentTargetSegmentChange: (value: string) => void;
  onExperimentTargetServerIdChange: (value: string) => void;
  onExperimentTargetCountryCodeChange: (value: string) => void;
  onExperimentVariantATitleChange: (value: string) => void;
  onExperimentVariantAMessageChange: (value: string) => void;
  onExperimentVariantAHeroImageUrlChange: (value: string) => void;
  onExperimentVariantACardStyleChange: (value: TelegramAnnouncementCardStyle) => void;
  onExperimentVariantBTitleChange: (value: string) => void;
  onExperimentVariantBMessageChange: (value: string) => void;
  onExperimentVariantBHeroImageUrlChange: (value: string) => void;
  onExperimentVariantBCardStyleChange: (value: TelegramAnnouncementCardStyle) => void;
  onExperimentIncludeSupportButtonChange: (value: boolean) => void;
  onExperimentPinToInboxChange: (value: boolean) => void;
  onLoadExperiment: (experiment: AnnouncementExperimentRow) => void;
  onLaunchExperiment: (experimentId: string) => void;
  onJumpToHistory: (announcementId: string) => void;
  getAnnouncementSegmentLabel: (segment: string, isMyanmar: boolean) => string;
};

export function AnnouncementExperimentsPanel({
  ui,
  isMyanmar,
  canManageAnnouncements,
  targetOptions,
  experiments,
  analyticsByExperiment,
  experimentId,
  experimentName,
  experimentAudience,
  experimentType,
  experimentTargetTag,
  experimentTargetSegment,
  experimentTargetServerId,
  experimentTargetCountryCode,
  experimentIncludeSupportButton,
  experimentPinToInbox,
  experimentVariantASplit,
  normalizedExperimentVariantASplit,
  normalizedExperimentVariantBSplit,
  experimentVariantATitle,
  experimentVariantAMessage,
  experimentVariantAHeroImageUrl,
  experimentVariantACardStyle,
  experimentVariantBTitle,
  experimentVariantBMessage,
  experimentVariantBHeroImageUrl,
  experimentVariantBCardStyle,
  savePending,
  launchPending,
  onReset,
  onSave,
  onLaunchCurrent,
  onExperimentNameChange,
  onExperimentAudienceChange,
  onExperimentTypeChange,
  onExperimentVariantASplitChange,
  onExperimentTargetTagChange,
  onExperimentTargetSegmentChange,
  onExperimentTargetServerIdChange,
  onExperimentTargetCountryCodeChange,
  onExperimentVariantATitleChange,
  onExperimentVariantAMessageChange,
  onExperimentVariantAHeroImageUrlChange,
  onExperimentVariantACardStyleChange,
  onExperimentVariantBTitleChange,
  onExperimentVariantBMessageChange,
  onExperimentVariantBHeroImageUrlChange,
  onExperimentVariantBCardStyleChange,
  onExperimentIncludeSupportButtonChange,
  onExperimentPinToInboxChange,
  onLoadExperiment,
  onLaunchExperiment,
  onJumpToHistory,
  getAnnouncementSegmentLabel,
}: AnnouncementExperimentsPanelProps) {
  const saveDisabled =
    !canManageAnnouncements ||
    savePending ||
    experimentName.trim().length < 3 ||
    experimentVariantATitle.trim().length < 3 ||
    experimentVariantAMessage.trim().length < 10 ||
    experimentVariantBTitle.trim().length < 3 ||
    experimentVariantBMessage.trim().length < 10;

  const launchCurrentDisabled = !canManageAnnouncements || launchPending || !experimentId;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{ui.announcementExperimentsTitle}</p>
          <p className="text-xs text-muted-foreground">{ui.announcementExperimentsDesc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onReset}>
            {ui.announcementExperimentCreateNew}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onSave} disabled={saveDisabled}>
            {savePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {ui.announcementExperimentSave}
          </Button>
          <Button type="button" size="sm" onClick={onLaunchCurrent} disabled={launchCurrentDisabled}>
            {launchPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
            {ui.announcementExperimentLaunch}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        <div>
          <Label>{ui.announcementExperimentName}</Label>
          <Input
            value={experimentName}
            onChange={(event) => onExperimentNameChange(event.target.value)}
            placeholder="Premium upsell April"
            className="mt-2"
          />
        </div>
        <div>
          <Label>{ui.announcementAudience}</Label>
          <Select value={experimentAudience} onValueChange={onExperimentAudienceChange}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE_USERS">Active Telegram users</SelectItem>
              <SelectItem value="STANDARD_USERS">Standard users</SelectItem>
              <SelectItem value="PREMIUM_USERS">Premium users</SelectItem>
              <SelectItem value="TRIAL_USERS">Trial users</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{ui.announcementType}</Label>
          <Select value={experimentType} onValueChange={onExperimentTypeChange}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PROMO">Promo</SelectItem>
              <SelectItem value="ANNOUNCEMENT">Announcement</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
              <SelectItem value="NEW_SERVER">New server</SelectItem>
              <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{ui.announcementExperimentSplit}</Label>
          <Input
            type="number"
            min={5}
            max={95}
            value={experimentVariantASplit}
            onChange={(event) => onExperimentVariantASplitChange(event.target.value)}
            className="mt-2"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Variant A {normalizedExperimentVariantASplit}% • Variant B {normalizedExperimentVariantBSplit}%
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        <div>
          <Label>{ui.announcementTargetTag}</Label>
          <Select value={experimentTargetTag} onValueChange={onExperimentTargetTagChange}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{ui.announcementAllTargets}</SelectItem>
              {targetOptions.tags.map((tag) => (
                <SelectItem key={tag.value} value={tag.value}>
                  {tag.value} ({tag.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Segment</Label>
          <Select value={experimentTargetSegment} onValueChange={onExperimentTargetSegmentChange}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
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
        <div>
          <Label>{ui.announcementTargetServer}</Label>
          <Select value={experimentTargetServerId} onValueChange={onExperimentTargetServerIdChange}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{ui.announcementAllTargets}</SelectItem>
              {targetOptions.servers.map((server) => (
                <SelectItem key={server.value} value={server.value}>
                  {server.label} ({server.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{ui.announcementTargetRegion}</Label>
          <Select value={experimentTargetCountryCode} onValueChange={onExperimentTargetCountryCodeChange}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{ui.announcementAllTargets}</SelectItem>
              {targetOptions.regions.map((region) => (
                <SelectItem key={region.value} value={region.value}>
                  {region.value} ({region.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border/50 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{ui.announcementExperimentVariantA}</p>
            <Badge variant="outline">{normalizedExperimentVariantASplit}%</Badge>
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <Label>{ui.announcementSubject}</Label>
              <Input
                value={experimentVariantATitle}
                onChange={(event) => onExperimentVariantATitleChange(event.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label>{ui.announcementBody}</Label>
              <Textarea
                value={experimentVariantAMessage}
                onChange={(event) => onExperimentVariantAMessageChange(event.target.value)}
                className="mt-2 min-h-[140px]"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{ui.announcementCardStyle}</Label>
                <Select value={experimentVariantACardStyle} onValueChange={onExperimentVariantACardStyleChange}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEFAULT">Default</SelectItem>
                    <SelectItem value="PROMO">Promo</SelectItem>
                    <SelectItem value="PREMIUM">Premium</SelectItem>
                    <SelectItem value="OPERATIONS">Operations</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{ui.announcementHeroImage}</Label>
                <Input
                  value={experimentVariantAHeroImageUrl}
                  onChange={(event) => onExperimentVariantAHeroImageUrlChange(event.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{ui.announcementExperimentVariantB}</p>
            <Badge variant="outline">{normalizedExperimentVariantBSplit}%</Badge>
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <Label>{ui.announcementSubject}</Label>
              <Input
                value={experimentVariantBTitle}
                onChange={(event) => onExperimentVariantBTitleChange(event.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label>{ui.announcementBody}</Label>
              <Textarea
                value={experimentVariantBMessage}
                onChange={(event) => onExperimentVariantBMessageChange(event.target.value)}
                className="mt-2 min-h-[140px]"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{ui.announcementCardStyle}</Label>
                <Select value={experimentVariantBCardStyle} onValueChange={onExperimentVariantBCardStyleChange}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEFAULT">Default</SelectItem>
                    <SelectItem value="PROMO">Promo</SelectItem>
                    <SelectItem value="PREMIUM">Premium</SelectItem>
                    <SelectItem value="OPERATIONS">Operations</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{ui.announcementHeroImage}</Label>
                <Input
                  value={experimentVariantBHeroImageUrl}
                  onChange={(event) => onExperimentVariantBHeroImageUrlChange(event.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={experimentIncludeSupportButton}
            onCheckedChange={onExperimentIncludeSupportButtonChange}
          />
          <span className="text-sm text-muted-foreground">{ui.includeSupportButton}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={experimentPinToInbox} onCheckedChange={onExperimentPinToInboxChange} />
          <span className="text-sm text-muted-foreground">{ui.announcementPinToInbox}</span>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {experiments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved experiments yet.</p>
        ) : (
          experiments.map((experiment) => {
            const experimentAnalytics = analyticsByExperiment.get(experiment.id);

            return (
              <div key={experiment.id} className="rounded-2xl border border-border/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{experiment.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {experiment.audience} • {experiment.type}
                      {experiment.targetSegment
                        ? ` • ${getAnnouncementSegmentLabel(experiment.targetSegment, isMyanmar)}`
                        : ''}
                      {experiment.targetServerName ? ` • ${experiment.targetServerName}` : ''}
                      {experiment.targetCountryCode ? ` • ${experiment.targetCountryCode}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{experiment.status}</Badge>
                    {experiment.launchedAt ? (
                      <Badge variant="secondary">{formatDateTime(experiment.launchedAt)}</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {experiment.variants.map((variant) => {
                    const variantAnalytics = experimentAnalytics?.variants.find(
                      (entry) => entry.variantKey === variant.variantKey,
                    );

                    return (
                      <div key={`${experiment.id}:${variant.variantKey}`} className="rounded-xl border border-border/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{variant.label}</p>
                          <Badge variant="outline">{variant.allocationPercent}%</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{variant.title}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {variantAnalytics
                            ? `${variantAnalytics.sentCount}/${variantAnalytics.totalRecipients} sent • ${variantAnalytics.attributedOrders} orders • ${Math.round(variantAnalytics.conversionRate * 100)}% conv.`
                            : `${variant.sentCount}/${variant.totalRecipients} sent • ${variant.failedCount} failed`}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {experimentAnalytics ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {experimentAnalytics.sentCount}/{experimentAnalytics.totalRecipients} sent •{' '}
                    {experimentAnalytics.openCount} opens • {experimentAnalytics.clickCount} clicks •{' '}
                    {experimentAnalytics.attributedOrders} attributed orders
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {experiment.sentCount}/{experiment.totalRecipients} sent • {experiment.failedCount} failed
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => onLoadExperiment(experiment)}>
                    {ui.announcementExperimentLoad}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onLaunchExperiment(experiment.id)}
                    disabled={launchPending || experiment.status === 'RUNNING'}
                  >
                    {ui.announcementExperimentLaunch}
                  </Button>
                  {experimentAnalytics?.latestAnnouncementId || experiment.latestAnnouncementId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        onJumpToHistory(
                          experimentAnalytics?.latestAnnouncementId ||
                            experiment.latestAnnouncementId ||
                            '',
                        )
                      }
                    >
                      {ui.announcementExperimentJumpHistory}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
