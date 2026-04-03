export const TELEGRAM_PROMO_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type TelegramPromoDeliveryAttributionCandidate = {
  deliveryId: string;
  announcementId: string;
  announcementTitle: string;
  announcementType: string;
  audience: string;
  templateId?: string | null;
  templateName?: string | null;
  targetSegment?: string | null;
  cardStyle?: string | null;
  chatId: string;
  sentAt: Date;
};

export type TelegramPromoAttribution = {
  deliveryId: string;
  announcementId: string;
  announcementTitle: string;
  audience: string;
  templateId: string | null;
  templateName: string | null;
  targetSegment: string | null;
  cardStyle: string | null;
  sentAt: Date;
  minutesFromSend: number;
};

export function resolveTelegramPromoAttribution(input: {
  chatId?: string | null;
  createdAt: Date;
  deliveries: TelegramPromoDeliveryAttributionCandidate[];
  windowMs?: number;
}) {
  const chatId = input.chatId?.trim();
  if (!chatId) {
    return null;
  }

  const windowMs = input.windowMs ?? TELEGRAM_PROMO_ATTRIBUTION_WINDOW_MS;
  const createdAtMs = input.createdAt.getTime();

  const candidate = input.deliveries
    .filter(
      (delivery) =>
        delivery.chatId === chatId &&
        delivery.announcementType === 'PROMO' &&
        delivery.sentAt.getTime() <= createdAtMs &&
        createdAtMs - delivery.sentAt.getTime() <= windowMs,
    )
    .sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime())[0];

  if (!candidate) {
    return null;
  }

  return {
    deliveryId: candidate.deliveryId,
    announcementId: candidate.announcementId,
    announcementTitle: candidate.announcementTitle,
    audience: candidate.audience,
    templateId: candidate.templateId || null,
    templateName: candidate.templateName || null,
    targetSegment: candidate.targetSegment || null,
    cardStyle: candidate.cardStyle || null,
    sentAt: candidate.sentAt,
    minutesFromSend: Math.max(0, Math.round((createdAtMs - candidate.sentAt.getTime()) / (60 * 1000))),
  } satisfies TelegramPromoAttribution;
}

export function buildTelegramPromoDeliveryCandidates<
  T extends {
    id: string;
    title: string;
    type: string;
    audience: string;
    templateId?: string | null;
    templateName?: string | null;
    targetSegment?: string | null;
    cardStyle?: string | null;
    deliveries: Array<{
      id: string;
      chatId: string;
      status: string;
      sentAt: Date | null;
    }>;
  },
>(announcements: T[]) {
  return announcements.flatMap((announcement) =>
    announcement.deliveries
      .filter((delivery) => delivery.status === 'SENT' && Boolean(delivery.sentAt))
      .map((delivery) => ({
        deliveryId: delivery.id,
        announcementId: announcement.id,
        announcementTitle: announcement.title,
        announcementType: announcement.type,
        audience: announcement.audience,
        templateId: announcement.templateId || null,
        templateName: announcement.templateName || null,
        targetSegment: announcement.targetSegment || null,
        cardStyle: announcement.cardStyle || null,
        chatId: delivery.chatId,
        sentAt: delivery.sentAt as Date,
      })),
  );
}
