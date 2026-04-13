'use client';

import { Copy, Loader2, Save } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';

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

type AnnouncementPresetTemplate = {
  code: string;
  name: string;
  title: string;
  message: string;
  audience: TelegramAnnouncementPanelAudience;
  type: TelegramAnnouncementType;
  cardStyle: TelegramAnnouncementCardStyle;
  includeSupportButton: boolean;
  recurrenceType: TelegramAnnouncementRecurrenceType;
  targetTag?: string | null;
  targetSegment?: string | null;
  targetServerId?: string | null;
  targetCountryCode?: string | null;
  command: string;
};

type AnnouncementTemplateRow = {
  id: string;
  name: string;
  audience: TelegramAnnouncementPanelAudience;
  type: TelegramAnnouncementType;
  targetTag?: string | null;
  targetSegment?: string | null;
  targetServerId?: string | null;
  targetCountryCode?: string | null;
  cardStyle: TelegramAnnouncementCardStyle;
  title: string;
  message: string;
  heroImageUrl?: string | null;
  includeSupportButton: boolean;
  pinToInbox: boolean;
  recurrenceType?: TelegramAnnouncementRecurrenceType | null;
};

type AnnouncementTemplatesUi = {
  announcementPresetTemplatesTitle: string;
  announcementPresetTemplatesDesc: string;
  announcementTemplatesTitle: string;
  announcementTemplatesDesc: string;
  announcementTemplateName: string;
  announcementSaveTemplate: string;
  announcementSavePreset: string;
  announcementApplyTemplate: string;
  announcementCopyCommand: string;
  announcementDeleteTemplate: string;
  announcementNoTemplates: string;
  announcementCommandPreview: string;
};

type AnnouncementTemplatesTabProps = {
  ui: AnnouncementTemplatesUi;
  isMyanmar: boolean;
  canManageAnnouncements: boolean;
  templateName: string;
  presetTemplates: AnnouncementPresetTemplate[];
  templates: AnnouncementTemplateRow[];
  savePending: boolean;
  deletePending: boolean;
  onTemplateNameChange: (value: string) => void;
  onSaveCurrentTemplate: () => void;
  onApplyPresetTemplate: (preset: AnnouncementPresetTemplate) => void;
  onCopyCommand: (command: string) => void;
  onSavePresetTemplate: (preset: AnnouncementPresetTemplate) => void;
  onApplyTemplate: (template: AnnouncementTemplateRow) => void;
  onDeleteTemplate: (templateId: string) => void;
  buildTemplateCommand: (template: AnnouncementTemplateRow) => string;
  getAnnouncementCardStyleLabel: (
    cardStyle: TelegramAnnouncementCardStyle,
    isMyanmar: boolean,
  ) => string;
  getAnnouncementRecurrenceLabel: (
    recurrenceType: TelegramAnnouncementRecurrenceType | null | undefined,
    isMyanmar: boolean,
  ) => string;
};

export function AnnouncementTemplatesTab({
  ui,
  isMyanmar,
  canManageAnnouncements,
  templateName,
  presetTemplates,
  templates,
  savePending,
  deletePending,
  onTemplateNameChange,
  onSaveCurrentTemplate,
  onApplyPresetTemplate,
  onCopyCommand,
  onSavePresetTemplate,
  onApplyTemplate,
  onDeleteTemplate,
  buildTemplateCommand,
  getAnnouncementCardStyleLabel,
  getAnnouncementRecurrenceLabel,
}: AnnouncementTemplatesTabProps) {
  return (
    <TabsContent value="templates" className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{ui.announcementPresetTemplatesTitle}</p>
          <p className="text-xs text-muted-foreground">{ui.announcementPresetTemplatesDesc}</p>
        </div>
        <div className="mt-3 space-y-2">
          {presetTemplates.map((preset) => (
            <div key={preset.code} className="rounded-2xl border border-border/60 bg-background/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{preset.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{preset.title}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{preset.type}</Badge>
                  <Badge variant="outline">{preset.audience}</Badge>
                  <Badge variant="outline">
                    {getAnnouncementCardStyleLabel(preset.cardStyle, isMyanmar)}
                  </Badge>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{preset.message}</p>
              <div className="mt-3 rounded-xl border border-border/50 bg-muted/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {ui.announcementCommandPreview}
                </p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {preset.command}
                </pre>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => onApplyPresetTemplate(preset)}>
                  {ui.announcementApplyTemplate}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => onCopyCommand(preset.command)}>
                  <Copy className="mr-2 h-4 w-4" />
                  {ui.announcementCopyCommand}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onSavePresetTemplate(preset)}
                  disabled={!canManageAnnouncements || savePending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {ui.announcementSavePreset}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{ui.announcementTemplatesTitle}</p>
          <p className="text-xs text-muted-foreground">{ui.announcementTemplatesDesc}</p>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={templateName}
            onChange={(event) => onTemplateNameChange(event.target.value)}
            placeholder={ui.announcementTemplateName}
          />
          <Button
            type="button"
            variant="outline"
            onClick={onSaveCurrentTemplate}
            disabled={!canManageAnnouncements || savePending}
          >
            {savePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {ui.announcementSaveTemplate}
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {templates.length ? (
            templates.map((template) => {
              const command = buildTemplateCommand(template);

              return (
                <div key={template.id} className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{template.name}</p>
                      <p className="text-xs text-muted-foreground">{template.title}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{template.type}</Badge>
                      <Badge variant="outline">
                        {getAnnouncementCardStyleLabel(template.cardStyle, isMyanmar)}
                      </Badge>
                      {template.recurrenceType && template.recurrenceType !== 'NONE' ? (
                        <Badge variant="secondary">
                          {getAnnouncementRecurrenceLabel(template.recurrenceType, isMyanmar)}
                        </Badge>
                      ) : null}
                      {template.pinToInbox ? <Badge variant="secondary">Pinned</Badge> : null}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {ui.announcementCommandPreview}
                    </p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {command}
                    </pre>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => onApplyTemplate(template)}>
                      {ui.announcementApplyTemplate}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => onCopyCommand(command)}>
                      <Copy className="mr-2 h-4 w-4" />
                      {ui.announcementCopyCommand}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onDeleteTemplate(template.id)}
                      disabled={deletePending}
                    >
                      {ui.announcementDeleteTemplate}
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-muted-foreground">{ui.announcementNoTemplates}</p>
          )}
        </div>
      </div>
    </TabsContent>
  );
}
