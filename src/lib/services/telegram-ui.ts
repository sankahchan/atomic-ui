import type { SupportedLocale } from '@/lib/i18n/config';
import { DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES, DEFAULT_TELEGRAM_WELCOME_MESSAGES } from '@/lib/services/telegram-copy';
import { parseDynamicRoutingPreferences } from '@/lib/services/dynamic-subscription-routing';
import { tagMatchesFilter } from '@/lib/tags';
import { formatBytes } from '@/lib/utils';

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getFlagEmoji(countryCode: string) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function buildTelegramProgressBar(percent: number, length = 10) {
  const filledLength = Math.max(0, Math.min(length, Math.round((percent / 100) * length)));
  const emptyLength = length - filledLength;
  return '▓'.repeat(filledLength) + '░'.repeat(emptyLength);
}

export function formatTelegramCountLabel(
  count: number,
  locale: SupportedLocale,
  singular: string,
  plural?: string,
  myanmarLabel?: string,
) {
  if (locale === 'my') {
    return `${count} ခု ${myanmarLabel || plural || singular}`;
  }

  const pluralLabel = plural || `${singular}s`;
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

export function getTelegramUi(locale: SupportedLocale) {
  const isMyanmar = locale === 'my';

  return {
    unlimited: isMyanmar ? 'အကန့်အသတ်မရှိ' : 'Unlimited',
    flashPlans: isMyanmar ? 'အမြန်အစီအစဉ်များ' : 'Flash Plans',
    seasonPlans: isMyanmar ? 'ရာသီအစီအစဉ်များ' : 'Season Plans',
    dynamicPlans: isMyanmar ? 'ဒိုင်နမစ် အစီအစဉ်များ' : 'Dynamic Plans',
    trialPlans: isMyanmar ? 'အစမ်းသုံး အစီအစဉ်များ' : 'Trial Plans',
    serverSwitches: isMyanmar ? 'ဆာဗာ ပြောင်းခွင့်' : 'Server switch limit',
    serverSwitchesHint: isMyanmar ? 'အသုံးပြုသူက ဆာဗာကို ဘယ်နှစ်ကြိမ် ပြောင်းခွင့်ရှိသလဲ။ (-1 ဆိုလျှင် အကန့်အသတ်မရှိ)' : 'Number of times the user can switch servers. (-1 for unlimited)',
    badge: isMyanmar ? 'တံဆိပ်' : 'Badge',
    badgeHint: isMyanmar ? 'တယ်လီဂရမ် အစီအစဉ်ကတ်တွင် ပြမည့် တံဆိပ်' : 'Badge to display on the plan card in Telegram.',
    none: isMyanmar ? 'မရှိပါ' : 'None',
    startsOnFirstUse: (days?: number | null) =>
      isMyanmar
        ? days
          ? `ပထမအသုံးပြုချိန်မှ စတင်မည် (${days} ရက်)`
          : 'ပထမအသုံးပြုချိန်မှ စတင်မည်'
        : days
          ? `Starts on first use (${days} days)`
          : 'Starts on first use',
    never: isMyanmar ? 'မကုန်ဆုံးပါ' : 'Never',
    expiredOn: (date: string) => (isMyanmar ? `${date} တွင် သက်တမ်းကုန်ပြီး` : `Expired on ${date}`),
    daysLeft: (days: number, date: string) =>
      isMyanmar ? `${days} ရက်ခန့် ကျန်သည် (${date})` : `${days} day(s) left (${date})`,
    openSharePage: isMyanmar ? 'မျှဝေစာမျက်နှာ ဖွင့်မည်' : 'Open Share Page',
    openSubscriptionUrl: isMyanmar ? 'စာရင်းသွင်းလင့်ခ် ဖွင့်မည်' : 'Open Subscription URL',
    openClientEndpoint: isMyanmar ? 'ကလိုင်းယင့် endpoint ဖွင့်မည်' : 'Open Client Endpoint',
    getSupport: isMyanmar ? 'အကူအညီ' : 'Support',
    premiumLabel: isMyanmar ? 'ပရီမီယမ် ပြောင်းလဲသတ်မှတ်သော့' : 'Premium dynamic key',
    premiumStableLink: isMyanmar
      ? 'တည်ငြိမ်သော ပရီမီယမ် လင့်ခ်တစ်ခုဖြင့် ဆက်သွယ်နိုင်ပါသည်။'
      : 'Connect with one stable premium link.',
    premiumAutoFailover: isMyanmar
      ? 'ဆာဗာတစ်ခု ပြဿနာရှိပါက အလိုအလျောက် fallback ဖြင့် ပြန်ရွေးပေးနိုင်ပါသည်။'
      : 'If one server has trouble, routing can fail over automatically.',
    premiumPreferredRegionSummary: (label: string) =>
      isMyanmar
        ? `ဦးစားပေး ဒေသ: ${label}`
        : `Preferred region: ${label}`,
    premiumPreferredServerSummary: (label: string) =>
      isMyanmar
        ? `ဦးစားပေး ဆာဗာအုပ်စု: ${label}`
        : `Preferred server pool: ${label}`,
    premiumSupportActionsTitle: isMyanmar
      ? 'ပရီမီယမ် အမြန်လုပ်ဆောင်ချက်များ'
      : 'Premium shortcuts',
    premiumChangeRegion: isMyanmar ? 'ဒေသ ပြောင်းရန်' : 'Change region',
    premiumReportRouteIssue: isMyanmar ? 'လမ်းကြောင်း ပြဿနာ တိုင်မည်' : 'Report issue',
    premiumRegionPrompt: (keyName: string, available: string) =>
      isMyanmar
        ? `🌍 <b>${keyName}</b> အတွက် ဦးစားပေး ဒေသကို ရွေးပါ။\nရရှိနိုင်သော ဒေသများ: ${available}\nရွေးချယ်ပြီးနောက် စီမံခန့်ခွဲသူ စစ်ဆေးမှုကို စောင့်ပါ။`
        : `🌍 Choose the preferred region for <b>${keyName}</b>.\nAvailable: ${available}\nAfter you choose one, wait for admin review.`,
    premiumNoRegions: isMyanmar
      ? 'ℹ️ ဤ ပရီမီယမ် သော့အတွက် ရွေးချယ်နိုင်သော ဒေသ မရှိသေးပါ။ စီမံခန့်ခွဲသူ သို့မဟုတ် အကူအညီကို ဆက်သွယ်ပေးပါ။'
      : 'ℹ️ There are no region choices configured for this premium key yet. Please contact admin/support.',
    premiumRegionRequestSubmitted: (keyName: string, regionLabel: string) =>
      isMyanmar
        ? `📨 <b>${keyName}</b> အတွက် ဦးစားပေး ဒေသကို <b>${regionLabel}</b> ဟု တောင်းဆိုထားပါသည်။\nစီမံခန့်ခွဲသူ စစ်ဆေးမှုကို စောင့်ပါ။`
        : `📨 Preferred region for <b>${keyName}</b> requested as <b>${regionLabel}</b>.\nWait for admin review.`,
    premiumRouteIssueSubmitted: (keyName: string) =>
      isMyanmar
        ? `🚨 <b>${keyName}</b> အတွက် ပရီမီယမ် လမ်းကြောင်း ပြဿနာကို ပို့ပြီးပါပြီ။\nလိုအပ်ပါက အကြောင်းပြန်ရန် သို့မဟုတ် /support ကို အသုံးပြုပါ။`
        : `🚨 Premium route issue sent for <b>${keyName}</b>.\nUse Reply or /support if you need to add detail.`,
    premiumSupportRequestSent: isMyanmar
      ? 'အကူအညီ တောင်းဆိုချက်ကို ပို့ပြီးပါပြီ။'
      : 'Support request sent.',
    premiumSupportRequestNotFound: isMyanmar
      ? '❌ ပရီမီယမ် သော့ကို မတွေ့ပါ။ /mykeys မှ ပြန်ရွေးပေးပါ။'
      : '❌ Premium key not found. Choose it again from /mykeys.',
    premiumSupportCancelled: isMyanmar
      ? 'အကူအညီ လုပ်ဆောင်ချက်ကို ပယ်ဖျက်လိုက်ပါပြီ။'
      : 'Support action cancelled.',
    premiumRegionUnknown: isMyanmar ? 'အလိုအလျောက် / စီမံခန့်ခွဲသူ စစ်ဆေးမှု' : 'Auto / admin review',
    premiumReviewAlertTitle: isMyanmar
      ? '💎 <b>ပရီမီယမ် ပြောင်းလဲသတ်မှတ်သော့ အကူအညီ တောင်းဆိုချက်</b>'
      : '💎 <b>Premium dynamic key support request</b>',
    premiumIssueTypeRegion: isMyanmar ? 'ဒေသ ပြောင်းရန်' : 'Region change',
    premiumIssueTypeRoute: isMyanmar ? 'လမ်းကြောင်း ပြဿနာ' : 'Route issue',
    premiumRequestType: isMyanmar ? 'တောင်းဆိုချက်အမျိုးအစား' : 'Request type',
    premiumCurrentPoolLabel: isMyanmar ? 'လက်ရှိ ဆာဗာအုပ်စု' : 'Current pool',
    premiumRequestedRegionLabel: isMyanmar ? 'တောင်းဆိုထားသော ဒေသ' : 'Requested region',
    premiumResolvedServer: isMyanmar ? 'လက်ရှိ ဆာဗာ' : 'Resolved server',
    premiumNoRequestedRegion: isMyanmar ? 'အလိုအလျောက် / စီမံခန့်ခွဲသူ စစ်ဆေးမှု' : 'Auto / admin review',
    premiumCurrentPin: isMyanmar ? 'လက်ရှိ ချိတ်ထားသောဆာဗာ' : 'Current pin',
    premiumReviewPanelLabel: isMyanmar ? 'ပြောင်းလဲသတ်မှတ်သော့ စာမျက်နှာ ဖွင့်ရန်' : 'Open dynamic key page',
    premiumRequestCodeLabel: isMyanmar ? 'အကူအညီ တောင်းဆိုချက်ကုဒ်' : 'Support request code',
    premiumSupportRequestPending: (requestCode: string) =>
      isMyanmar
        ? `ℹ️ ပရီမီယမ် အကူအညီ တောင်းဆိုချက် <b>${requestCode}</b> သည် ဖွင့်ထားပြီးဖြစ်ပါသည်။\nစီမံခန့်ခွဲသူ အပ်ဒိတ်ကို ဒီ chat မှာ စောင့်ပါ။`
        : `ℹ️ Premium support request <b>${requestCode}</b> is already open.\nWait for the admin update here.`,
    premiumReplyToRequest: isMyanmar ? 'အကြောင်းပြန်မည်' : 'Reply',
    premiumFollowUpPrompt: (requestCode: string, keyName: string) =>
      isMyanmar
        ? `✍️ <b>${requestCode}</b> (${keyName}) အတွက် အကြောင်းပြန်ချက်ကို ပို့ပါ။\nလမ်းကြောင်း၊ ဒေသ သို့မဟုတ် အမှားအသေးစိတ်ကို ထည့်နိုင်ပါသည်။ /cancel ဖြင့် ရပ်နိုင်ပါသည်။`
        : `✍️ Reply for <b>${requestCode}</b> (${keyName}).\nAdd route, region, or error detail. Use /cancel to stop.`,
    premiumFollowUpSubmitted: (requestCode: string) =>
      isMyanmar
        ? `📨 <b>${requestCode}</b> အတွက် အကြောင်းပြန်ချက်ကို ပို့ပြီးပါပြီ။\nအပ်ဒိတ်ကို ဒီ chat မှာ စောင့်ပါ။`
        : `📨 Reply sent for <b>${requestCode}</b>.\nUpdates stay in this chat.`,
    premiumFollowUpCancelled: isMyanmar
      ? 'ပရီမီယမ် တောင်းဆိုချက် နောက်ဆက်တွဲ မက်ဆေ့ချ်ကို ပယ်ဖျက်ပြီးပါပြီ။'
      : 'Cancelled the premium follow-up message.',
    premiumFollowUpNotAllowed: isMyanmar
      ? 'ဤ ပရီမီယမ် တောင်းဆိုချက် ပိတ်ထားပါသည်။ အသစ်စတင်ရန် /premium ကို သုံးပါ။'
      : 'This request is closed. Use /premium to start a new one.',
    premiumFollowUpHistoryTitle: isMyanmar ? 'နောက်ဆက်တွဲ စကားဝိုင်း' : 'Conversation',
    premiumFollowUpFromYou: isMyanmar ? 'သင်' : 'You',
    premiumFollowUpFromAdmin: isMyanmar ? 'စီမံခန့်ခွဲသူ' : 'Admin',
    premiumFollowUpNeedsReview: isMyanmar ? 'နောက်ဆက်တွဲ စစ်ရန် စောင့်နေ' : 'Follow-up waiting',
    premiumRenewalTitle: isMyanmar ? '💎 <b>ပရီမီယမ် သက်တမ်းတိုး သတိပေးချက်</b>' : '💎 <b>Premium renewal reminder</b>',
    premiumRenewalBody: (daysLeft: number) =>
      isMyanmar
        ? `သင့် ပရီမီယမ် ပြောင်းလဲသတ်မှတ်သော့ သက်တမ်းကုန်ရန် ${daysLeft} ရက်ခန့် ကျန်ပါသည်။`
        : `Your premium dynamic key has about ${daysLeft} day(s) left before it expires.`,
    premiumRenewalBenefits: isMyanmar
      ? 'သက်တမ်းတိုးပါက တည်ငြိမ်သော ပရီမီယမ် လင့်ခ်၊ အလိုအလျောက် fallback နှင့် ဦးစားပေး ဒေသ အကူအညီကို ဆက်လက် အသုံးပြုနိုင်ပါသည်။'
      : 'Renew to keep your stable premium link, auto failover, and preferred region support.',
    premiumRenewNow: isMyanmar ? 'ပရီမီယမ် သော့ကို သက်တမ်းတိုးရန်' : 'Renew premium key',
    premiumExpiredTitle: isMyanmar ? '⛔ <b>ပရီမီယမ် သော့ သက်တမ်းကုန်သွားပါပြီ</b>' : '⛔ <b>Premium key expired</b>',
    premiumExpiredBody: (keyName: string) =>
      isMyanmar
        ? `<b>${keyName}</b> ပရီမီယမ် ပြောင်းလဲသတ်မှတ်သော့ သက်တမ်းကုန်သွားပါပြီ။ ဆက်လက်အသုံးပြုလိုပါက သက်တမ်းတိုး အော်ဒါ တင်ပေးပါ။`
        : `Your premium dynamic key <b>${keyName}</b> has expired. Place a renewal order to keep using the service.`,
    premiumRequestApproved: (keyName: string, regionLabel?: string | null, supportLink?: string | null) =>
      isMyanmar
        ? [
            `✅ <b>${keyName}</b> အတွက် ပရီမီယမ် တောင်းဆိုချက်ကို လုပ်ဆောင်ပြီးပါပြီ။`,
            regionLabel ? `ဦးစားပေး ဒေသ: <b>${regionLabel}</b>` : 'လမ်းကြောင်း သတ်မှတ်ချက်ကို ပြန်လည်စစ်ဆေးပြီးပါပြီ။',
            supportLink ? `အကူအညီလိုပါက ${supportLink}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : [
            `✅ The premium request for <b>${keyName}</b> has been applied.`,
            regionLabel ? `Preferred region: <b>${regionLabel}</b>` : 'The routing preference has been reviewed.',
            supportLink ? `Need help? ${supportLink}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
    premiumIssueHandled: (keyName: string, supportLink?: string | null) =>
      isMyanmar
        ? [
            `✅ <b>${keyName}</b> အတွက် ပရီမီယမ် လမ်းကြောင်း ပြဿနာကို စစ်ဆေးပြီး အပ်ဒိတ်လုပ်ပြီးပါပြီ။`,
            supportLink ? `နောက်ထပ်အကူအညီလိုပါက ${supportLink}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : [
            `✅ The premium route issue for <b>${keyName}</b> has been reviewed and updated.`,
            supportLink ? `Need more help? ${supportLink}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
    premiumSupportDismissed: (keyName: string, message?: string | null, supportLink?: string | null) =>
      isMyanmar
        ? [
            `ℹ️ <b>${keyName}</b> အတွက် ပရီမီယမ် အကူအညီ တောင်းဆိုချက်ကို မလုပ်ဆောင်တော့ပါ။`,
            message || 'အသေးစိတ်အတွက် စီမံခန့်ခွဲသူ သို့မဟုတ် အကူအညီကို ဆက်သွယ်ပါ။',
            supportLink || '',
          ]
            .filter(Boolean)
            .join('\n')
        : [
            `ℹ️ The premium support request for <b>${keyName}</b> was dismissed.`,
            message || 'Please contact admin/support for more details.',
            supportLink || '',
          ]
            .filter(Boolean)
            .join('\n'),
    premiumHubTitle: isMyanmar ? '💎 <b>ပရီမီယမ် စင်တာ</b>' : '💎 <b>Premium center</b>',
    premiumHubEmpty: isMyanmar
      ? 'ချိတ်ထားသော ပရီမီယမ် သော့ မရှိသေးပါ။ အစီအစဉ် ရပြီးနောက် /premium ကို ပြန်ဖွင့်ပါ၊ သို့မဟုတ် /buy ဖြင့် အစီအစဉ်များကို ကြည့်ပါ။'
      : 'No premium key is linked yet. Open /premium again after you receive a plan, or use /buy to compare packages.',
    premiumHubHint: isMyanmar
      ? 'ဒေသ၊ ပြဿနာ၊ အခြေအနေတို့ကို ဒီနေရာမှ တစ်ခါတည်း ဆက်လုပ်နိုင်ပါသည်။'
      : 'Use this hub for region, issue, and status actions.',
    premiumThreadStatusLabel: isMyanmar ? 'စကားဝိုင်း အခြေအနေ' : 'Thread status',
    premiumStatusTitle: isMyanmar ? '🧾 <b>ပရီမီယမ် အကူအညီ အခြေအနေ</b>' : '🧾 <b>Premium support status</b>',
    premiumStatusEmpty: isMyanmar
      ? 'သင့်အတွက် ပရီမီယမ် တောင်းဆိုချက် မရှိသေးပါ။ /premium သို့မဟုတ် /mykeys မှ တောင်းဆိုချက် စတင်နိုင်ပါသည်။'
      : 'There are no premium requests for you yet. Use /premium or /mykeys to start one.',
    premiumRegionStatusTitle: isMyanmar ? '🌍 <b>ပရီမီယမ် ဒေသ အခြေအနေ</b>' : '🌍 <b>Premium region status</b>',
    premiumRegionStatusEmpty: isMyanmar
      ? 'ချိတ်ထားသော ပရီမီယမ် သော့ မရှိသေးပါ။ အစီအစဉ် ရပြီးနောက် /premiumregion ကို အသုံးပြုပါ။'
      : 'No premium key is linked yet. Use /premiumregion after you receive a premium plan.',
    premiumRegionStatusHint: isMyanmar
      ? 'ဦးစားပေး ဒေသ၊ လက်ရှိ လမ်းကြောင်း နှင့် အခြေအနေကို ဒီနေရာမှ တိုက်ရိုက် စစ်နိုင်ပါသည်။'
      : 'Use this view to check your preferred region, route, and health.',
    premiumRegionCurrentRouteLabel: isMyanmar ? 'လက်ရှိ လမ်းကြောင်း' : 'Current route',
    premiumRegionPreferredLabel: isMyanmar ? 'ဦးစားပေး ဒေသများ' : 'Preferred regions',
    premiumRegionAttachedLabel: isMyanmar ? 'ချိတ်ထားသော ဆာဗာများ' : 'Attached servers',
    premiumRegionNoAttached: isMyanmar ? 'ချိတ်ထားသော ဆာဗာ မရှိသေးပါ' : 'No attached server yet',
    premiumRegionUp: isMyanmar ? 'ကောင်းမွန်' : 'Healthy',
    premiumRegionSlow: isMyanmar ? 'နှေးနေသည်' : 'Slow',
    premiumRegionDown: isMyanmar ? 'မရနိုင်ပါ' : 'Down',
    premiumRegionUnknownStatus: isMyanmar ? 'မသိရသေး' : 'Unknown',
    premiumRegionStatusFootnote: isMyanmar
      ? 'ဒေသ အခြေအနေကို နောက်ဆုံး health check အချက်အလက်အပေါ် အခြေခံပြီး ပြထားပါသည်။'
      : 'Region status is based on the latest server health checks.',
    premiumRegionAlertTitle: isMyanmar ? '⚠️ <b>ပရီမီယမ် ဒေသ သတိပေးချက်</b>' : '⚠️ <b>Premium region alert</b>',
    premiumRegionAlertCurrentLabel: isMyanmar ? 'ထိခိုက်နေသော လမ်းကြောင်း' : 'Impacted route',
    premiumRegionAlertSuggestedLabel: isMyanmar ? 'အကြံပြု fallback ဒေသများ' : 'Suggested fallback regions',
    premiumRegionAlertNoFallback: isMyanmar
      ? 'ယခုအချိန်တွင် ပိုကောင်းသော fallback ဒေသ မတွေ့သေးပါ။ စီမံခန့်ခွဲသူ သို့မဟုတ် အကူအညီကို ဆက်သွယ်ပါ။'
      : 'There is no better fallback region yet. Please contact admin/support.',
    premiumRegionAlertHint: isMyanmar
      ? 'အောက်ပါ ဒေသခလုတ်များထဲမှ တစ်ခုကို နှိပ်ပြီး ဦးစားပေး ဒေသ ပြောင်းရန် တောင်းဆိုနိုင်ပါသည်။'
      : 'Choose one of the regions below to request a preferred-region change.',
    premiumRegionAlertHealthyHint: isMyanmar
      ? 'လမ်းကြောင်း မတည်ငြိမ်ပါက /premiumregion ဖြင့် အခြေအနေကို စစ်ပြီး စီမံခန့်ခွဲသူကို ဆက်သွယ်နိုင်ပါသည်။'
      : 'If routing still feels unstable, use /premiumregion to check status and contact admin.',
    premiumRegionFallbackTitle: isMyanmar ? '🔁 <b>ပရီမီယမ် fallback အသုံးပြုနေသည်</b>' : '🔁 <b>Premium fallback activated</b>',
    premiumRegionFallbackAppliedLabel: isMyanmar ? 'ယာယီ fallback' : 'Temporary fallback',
    premiumRegionFallbackUntilLabel: isMyanmar ? 'ယာယီ ချိတ်ထားမှု ကုန်ချိန်' : 'Fallback pin expires',
    premiumRegionFallbackHint: isMyanmar
      ? 'ဦးစားပေး ဒေသ ပြန်ကောင်းလာပါက ထပ်မံအသိပေးပို့ပေးမည်။ လက်ရှိ fallback ကို ပြောင်းလိုပါက အကူအညီကို အသုံးပြုနိုင်ပါသည်။'
      : 'We will notify you again when the preferred region is healthy. If you want to change this fallback, use support.',
    premiumRegionRecoveredTitle: isMyanmar ? '✅ <b>ဦးစားပေး ဒေသ ပြန်ကောင်းလာပြီ</b>' : '✅ <b>Preferred region recovered</b>',
    premiumRegionRecoveredLabel: isMyanmar ? 'ပြန်ကောင်းလာသော ဒေသ' : 'Recovered region',
    premiumRegionCurrentFallbackLabel: isMyanmar ? 'လက်ရှိ fallback' : 'Current fallback',
    premiumRegionRecoveryTimeLabel: isMyanmar ? 'ပြန်ကောင်းလာချိန်' : 'Recovery time',
    premiumRegionRecoveredHint: isMyanmar
      ? 'လိုအပ်ပါက အောက်ပါ ဒေသခလုတ်ကို နှိပ်ပြီး ဦးစားပေး ဒေသသို့ ပြန်ပြောင်းရန် တောင်းဆိုနိုင်ပါသည်။'
      : 'If you want to move back to the preferred region, tap one of the region buttons below.',
    premiumStatusHint: isMyanmar
      ? 'အသစ် တောင်းဆိုချက် စတင်ရန် /premium ကို အသုံးပြုနိုင်ပါသည်။'
      : 'Use /premium to start a new request.',
    premiumOpenRequestLabel: isMyanmar ? 'ဖွင့်ထားသော တောင်းဆိုချက်' : 'Open request',
    premiumLatestReplyLabel: isMyanmar ? 'နောက်ဆုံး အကြောင်းပြန်ချက်' : 'Last reply',
    premiumAwaitingAdminReply: isMyanmar ? 'စီမံခန့်ခွဲသူ စစ်နေ' : 'Admin reviewing',
    premiumAwaitingYourReply: isMyanmar ? 'အကြောင်းပြန်ရန် လိုအပ်' : 'Reply needed',
    premiumStatusReplyHint: isMyanmar
      ? 'အသေးစိတ်ထည့်ရန် အကြောင်းပြန်ရန် ကို နှိပ်ပါ။'
      : 'Tap Reply to add detail.',
    premiumStatusUpdatedLabel: isMyanmar ? 'နောက်ဆုံး အပ်ဒိတ်' : 'Updated',
    premiumResponseTimeLabel: isMyanmar ? 'ပထမအဖြေ' : 'First response',
    premiumResolutionTimeLabel: isMyanmar ? 'ဖြေရှင်းပြီး' : 'Resolved',
    premiumNoPinApplied: isMyanmar ? 'ချိတ်ထားသောဆာဗာ မသတ်မှတ်ရသေး' : 'No pin applied',
    premiumStatusPendingReview: isMyanmar ? 'စစ်နေဆဲ' : 'Pending',
    premiumStatusApproved: isMyanmar ? 'အတည်ပြုပြီး' : 'Approved',
    premiumStatusHandled: isMyanmar ? 'ဖြေရှင်းပြီး' : 'Handled',
    premiumStatusDismissed: isMyanmar ? 'ပိတ်လိုက်သည်' : 'Dismissed',
    premiumHistorySubmitted: isMyanmar ? 'တောင်းဆိုချက် ပို့ပြီး' : 'Request submitted',
    premiumHistoryReviewed: isMyanmar ? 'စီမံခန့်ခွဲသူ စစ်ပြီး' : 'Admin reviewed',
    premiumHistoryApproved: isMyanmar ? 'ဦးစားပေး ဒေသ ပြောင်းလဲပြီး' : 'Preferred region updated',
    premiumHistoryHandled: isMyanmar ? 'လမ်းကြောင်း ပြဿနာ ဖြေရှင်းပြီး' : 'Route issue handled',
    premiumHistoryDismissed: isMyanmar ? 'တောင်းဆိုချက် ပိတ်လိုက်သည်' : 'Request dismissed',
    premiumHistoryPinApplied: isMyanmar ? 'ယာယီ pin သတ်မှတ်ထား' : 'Temporary pin applied',
    accessShareFallback: isMyanmar
      ? 'အောက်ပါ မျှဝေစာမျက်နှာကို ဖွင့်ပြီး ထည့်သွင်းနည်း၊ လက်ဖြင့်ဆက်တင်နှင့် နောက်ဆုံး ချိတ်ဆက်မှု အသေးစိတ်ကို ကြည့်နိုင်ပါသည်။'
      : 'Open the share page below for install steps, manual setup, and the latest connection details.',
    dynamicShareFallback: isMyanmar
      ? 'အောက်ပါ မျှဝေစာမျက်နှာကို ဖွင့်ပြီး ထည့်သွင်းနည်း၊ လက်ဖြင့်ဆက်တင်နှင့် backend အသေးစိတ်ကို ကြည့်နိုင်ပါသည်။'
      : 'Open the share page below for install steps, manual setup, and the latest backend details.',
    dynamicShareDisabledFallback: isMyanmar
      ? 'ဤ သော့အတွက် မျှဝေစာမျက်နှာကို ပိတ်ထားသည်။ Outline သို့မဟုတ် သဟဇာတဖြစ်သော client ထဲတွင် အောက်ပါ client endpoint ကို အသုံးပြုပါ။'
      : 'The share page is disabled for this key. Use the client endpoint below inside Outline or another compatible client.',
    accessQrCaption: isMyanmar
      ? 'တိုက်ရိုက် ထည့်သွင်းမှု မရပါက ဤ QR ကုဒ်ကို သင့် VPN အက်ပ်ဖြင့် scan လုပ်ပါ။'
      : 'Scan this QR code with your VPN client if direct import is unavailable.',
    dynamicQrCaption: isMyanmar
      ? 'တိုက်ရိုက် ထည့်သွင်းမှု မရပါက Outline သို့မဟုတ် သဟဇာတဖြစ်သော client ဖြင့် ဤ QR ကုဒ်ကို scan လုပ်ပါ။'
      : 'Scan this QR code with Outline or another compatible client if direct import is unavailable.',
    showQrCode: isMyanmar ? 'QR ကုဒ် ပြမည်' : 'Show QR Code',
    accessReasonTitle: (reason?: string) =>
      reason === 'CREATED'
        ? (isMyanmar ? '🎉 <b>သင့် အသုံးပြုခွင့်သော့ အသင့်ဖြစ်ပါပြီ</b>' : '🎉 <b>Your access key is ready</b>')
        : reason === 'KEY_ENABLED'
          ? (isMyanmar ? '✅ <b>သင့် အသုံးပြုခွင့်သော့ကို ပြန်ဖွင့်ပြီးပါပြီ</b>' : '✅ <b>Your access key has been re-enabled</b>')
          : reason === 'LINKED'
            ? (isMyanmar ? '🔗 <b>Telegram ချိတ်ဆက်မှု အောင်မြင်ပါသည်</b>' : '🔗 <b>Telegram linked successfully</b>')
            : reason === 'USAGE_REQUEST'
              ? (isMyanmar ? '📊 <b>သင့် အသုံးပြုမှု အသေးစိတ်</b>' : '📊 <b>Your VPN access details</b>')
              : reason === 'SUBSCRIPTION_REQUEST'
                ? (isMyanmar ? '📎 <b>သင့် စာရင်းသွင်းလင့်ခ်များ</b>' : '📎 <b>Your subscription links</b>')
                : (isMyanmar ? '📨 <b>သင့် မျှဝေစာမျက်နှာ</b>' : '📨 <b>Your share page</b>'),
    dynamicReasonTitle: (reason?: string) =>
      reason === 'CREATED'
        ? (isMyanmar ? '🎉 <b>သင့် ပြောင်းလဲသတ်မှတ်သော့ အသင့်ဖြစ်ပါပြီ</b>' : '🎉 <b>Your dynamic key is ready</b>')
        : reason === 'KEY_ENABLED'
          ? (isMyanmar ? '✅ <b>သင့် ပြောင်းလဲသတ်မှတ်သော့ကို ပြန်ဖွင့်ပြီးပါပြီ</b>' : '✅ <b>Your dynamic key has been re-enabled</b>')
          : reason === 'LINKED'
            ? (isMyanmar ? '🔗 <b>Telegram ချိတ်ဆက်မှု အောင်မြင်ပါသည်</b>' : '🔗 <b>Telegram linked successfully</b>')
            : reason === 'USAGE_REQUEST'
              ? (isMyanmar ? '📊 <b>သင့် ပြောင်းလဲသတ်မှတ် အသုံးပြုမှု အသေးစိတ်</b>' : '📊 <b>Your dynamic VPN access details</b>')
              : reason === 'SUBSCRIPTION_REQUEST'
                ? (isMyanmar ? '📎 <b>သင့် ပြောင်းလဲသတ်မှတ် စာရင်းသွင်းလင့်ခ်များ</b>' : '📎 <b>Your dynamic subscription links</b>')
                : (isMyanmar ? '📨 <b>သင့် ပြောင်းလဲသတ်မှတ် မျှဝေစာမျက်နှာ</b>' : '📨 <b>Your dynamic share page</b>'),
    modeSelfManaged: isMyanmar ? 'ကိုယ်တိုင်စီမံ' : 'Self-Managed',
    modeManual: isMyanmar ? 'လက်ဖြင့်စီမံ' : 'Manual',
    coverageAutoSelected: isMyanmar ? 'ခေါ်ယူချိန်တွင် အလိုအလျောက် ရွေးမည်' : 'Auto-selected at fetch time',
    lifecycleDisabledTitle: isMyanmar ? '⛔ <b>သင့် အသုံးပြုခွင့်သော့ကို ပိတ်ထားပါသည်</b>' : '⛔ <b>Your access key has been disabled</b>',
    lifecycleDisabledBody: isMyanmar ? 'Administrator က ပြန်ဖွင့်ပေးသည့်အထိ traffic ကို အသုံးမပြုနိုင်ပါ။' : 'Traffic is blocked until the key is re-enabled by an administrator.',
    lifecycleExpiring7Title: isMyanmar ? '⏳ <b>သင့် အသုံးပြုခွင့်သော့ သက်တမ်း မကြာမီကုန်မည်</b>' : '⏳ <b>Your access key will expire soon</b>',
    lifecycleExpiring7Body: (days: number) => isMyanmar ? `သက်တမ်းကုန်ရန် ${days} ရက်ခန့် ကျန်ပါသည်။` : `There are about ${days} day(s) left before expiration.`,
    lifecycleExpiring3Title: isMyanmar ? '⚠️ <b>သင့် အသုံးပြုခွင့်သော့ သက်တမ်း အလွန်နီးကပ်ပါပြီ</b>' : '⚠️ <b>Your access key expires very soon</b>',
    lifecycleExpiring3Body: (days: number) => isMyanmar ? `${days} ရက်ခန့်သာ ကျန်ပါသည်။` : `Only about ${days} day(s) remain.`,
    lifecycleExpiredTitle: isMyanmar ? '⌛ <b>သင့် အသုံးပြုခွင့်သော့ သက်တမ်းကုန်သွားပါပြီ</b>' : '⌛ <b>Your access key has expired</b>',
    lifecycleExpiredBody: isMyanmar ? 'ဤ သော့ကို မလုပ်ဆောင်နိုင်တော့ပါ။ သက်တမ်းတိုးလိုပါက အကူအညီကို ဆက်သွယ်ပါ။' : 'The key is no longer active. Contact support if it should be renewed.',
    startLinked: (username: string) =>
      isMyanmar
        ? `✅ <b>${username}</b> အတွက် Telegram ချိတ်ဆက်ပြီးပါပြီ။\n\n<b>အမြန်စတင်ရန်</b>\n• 🗂 /mykeys ဖြင့် သော့များနှင့် သက်တမ်းတိုးမှုများကို စစ်ပါ\n• 🛒 /buy ဖြင့် အော်ဒါအသစ် စတင်ပါ\n• 📊 /status ဖြင့် အမြန်အခြေအနေ စစ်ပါ\n• 🛟 /support ဖြင့် အကူအညီ ရယူပါ\n\nအောက်ရှိ မီနူးကို နှိပ်ပြီး ဆက်လုပ်နိုင်ပါသည်။`
        : `✅ Telegram linked for <b>${username}</b>.\n\n<b>Start here</b>\n• 🗂 /mykeys for keys and renewals\n• 🛒 /buy for a new order\n• 📊 /status for your quick status\n• 🛟 /support for help\n\nUse the menu below for the fastest path.`,
    linkExpired: isMyanmar ? '⚠️ ဤ Telegram link သက်တမ်းကုန်သွားပါပြီ။ Admin ထံမှ link အသစ်တောင်းပါ။' : '⚠️ This Telegram link has expired. Ask the admin to generate a new one.',
    linkInvalid: isMyanmar ? '❌ ဤ Telegram link ကို မသုံးနိုင်တော့ပါ။ Admin ထံမှ link အသစ်တောင်းပါ။' : '❌ That Telegram link is not valid anymore. Ask the admin for a fresh link.',
    welcomeBack: (username: string) =>
      isMyanmar
        ? `✅ <b>${username}</b> ကို ပြန်လည်ကြိုဆိုပါသည်!\n\n<b>အမြန်စတင်ရန်</b>\n• 🗂 /mykeys ဖြင့် သော့များနှင့် သက်တမ်းတိုးမှုများကို စစ်ပါ\n• 🛒 /buy ဖြင့် အော်ဒါအသစ် စတင်ပါ\n• 📊 /status ဖြင့် အမြန်အခြေအနေ စစ်ပါ\n• 🛟 /support ဖြင့် အကူအညီ ရယူပါ\n\nအောက်ရှိ မီနူးကို နှိပ်ပြီး အလွယ်တကူ ဆက်လုပ်နိုင်ပါသည်။`
        : `✅ Welcome back, <b>${username}</b>!\n\n<b>Start here</b>\n• 🗂 /mykeys for keys and renewals\n• 🛒 /buy for a new order\n• 📊 /status for your quick status\n• 🛟 /support for help\n\nUse the menu below for the fastest path.`,
    accountLinked: (username: string) =>
      isMyanmar
        ? `✅ အကောင့် ချိတ်ဆက်မှု အောင်မြင်ပါသည်!\n\n<b>အမြန်စတင်ရန်</b>\n• 🗂 /mykeys ဖြင့် သော့များကို စစ်ပါ\n• 🛒 /buy ဖြင့် အော်ဒါအသစ် စတင်ပါ\n• 📊 /status ဖြင့် အမြန်အခြေအနေ စစ်ပါ\n• 🛟 /support ဖြင့် အကူအညီ ရယူပါ\n\nအောက်ရှိ မီနူးကို နှိပ်ပြီး စတင်နိုင်ပါသည်။`
        : `✅ Account linked successfully!\n\n<b>Start here</b>\n• 🗂 /mykeys for your linked keys\n• 🛒 /buy for a new order\n• 📊 /status for your quick status\n• 🛟 /support for help\n\nUse the menu below to continue.`,
    adminRecognized: isMyanmar ? '\n\nသင့်ကို administrator အဖြစ် သတ်မှတ်ထားပါသည်။' : '\n\nYou are recognized as an administrator.',
    languagePrompt: isMyanmar ? '🌐 ဘာသာစကား ရွေးချယ်ပါ။' : '🌐 Choose your language.',
    languagePromptDesc: isMyanmar
      ? 'ဆက်သွယ်မှုများ၊ အော်ဒါလုပ်ငန်းစဉ်နှင့် သော့ပို့ပေးခြင်းတို့ကို သင့်ရွေးချယ်ထားသော ဘာသာစကားဖြင့် ဆက်လုပ်ပေးပါမည်။'
      : 'The bot will continue in your selected language for orders, support, and key delivery.',
    languageChanged: (languageName: string) =>
      isMyanmar
        ? `✅ ဘာသာစကားကို <b>${languageName}</b> သို့ ပြောင်းပြီးပါပြီ။`
        : `✅ Language updated to <b>${languageName}</b>.`,
    languageCommandHelp: isMyanmar
      ? '/start - အဓိက မီနူးကို ပြန်ဖွင့်ပြီး လိုအပ်ပါက ဘာသာစကားကို ပြန်ရွေးပါ'
      : '/start - Reopen the main menu and pick your language again if needed',
    hello: (username: string, welcome: string, telegramUserId: number, adminMsg: string) =>
      isMyanmar
        ? `👋 မင်္ဂလာပါ၊ <b>${username}</b>!${adminMsg}\n\n${welcome}\n\nအမြန်မီနူးကို အသုံးပြု၍ အလွယ်တကူ ဆက်လုပ်နိုင်ပါသည်။\n\nသင့် Telegram ID: <code>${telegramUserId}</code>`
        : `👋 Hello, <b>${username}</b>!${adminMsg}\n\n${welcome}\n\nQuick menu: use the buttons below for the fastest navigation.\n\nYour Telegram ID: <code>${telegramUserId}</code>`,
    defaultWelcome: DEFAULT_TELEGRAM_WELCOME_MESSAGES[locale],
    emailNoKeys: (email: string) => isMyanmar ? `❌ ${email} အတွက် သော့ မတွေ့ပါ။` : `❌ No keys found for email: ${email}`,
    emailLinked: (count: number) => isMyanmar
      ? `✅ သော့ ${count} ခုကို ဤ Telegram အကောင့်နှင့် ချိတ်ဆက်ပြီးပါပြီ။\n\n/status ဖြင့် အမြန်အခြေအနေ စစ်နိုင်ပြီး /mykeys ဖြင့် သော့များကို ပြန်ဖွင့်နိုင်ပါသည်။`
      : `✅ Linked ${formatTelegramCountLabel(count, locale, 'key')} to this Telegram account.\n\nUse /status for a quick summary or /mykeys to reopen your keys.`,
    keyNotFoundDefault: DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES[locale],
    usageTitle: isMyanmar ? '📊 <b>သင့် VPN အသုံးပြုမှု</b>\n\n' : '📊 <b>Your VPN Usage</b>\n\n',
    myKeysEmpty: isMyanmar
      ? '❌ ဤ Telegram အကောင့်နှင့် ချိတ်ထားသော သော့ မရှိသေးပါ။ သော့အသစ်ဝယ်ရန် /buy ကို သုံးပါ။ ပထမဆုံး အသုံးပြုသူဖြစ်ပါက /start ကို ပြန်ပို့ပြီး အခမဲ့ အစမ်းအပ်နှံချက် ရှိမရှိ စစ်နိုင်ပါသည်။'
      : '❌ No linked keys were found for this Telegram account yet. Use /buy for a new key. If you are brand new, send /start again to check the free-trial offer.',
    myKeysTitle: isMyanmar ? '🗂 <b>သင့် သော့များ</b>' : '🗂 <b>Your keys</b>',
    myKeysSectionStandard: isMyanmar ? '🔑 <b>ပုံမှန် သော့များ</b>' : '🔑 <b>Standard keys</b>',
    myKeysSectionTrial: isMyanmar ? '🎁 <b>အစမ်း သော့များ</b>' : '🎁 <b>Trial keys</b>',
    myKeysSectionPremium: isMyanmar ? '💎 <b>ပရီမီယမ် သော့များ</b>' : '💎 <b>Premium keys</b>',
    myKeysTypeStandard: isMyanmar ? 'ပုံမှန် အသုံးပြုခွင့်သော့' : 'Normal access key',
    myKeysTypeTrial: isMyanmar ? 'အခမဲ့ အစမ်းသော့' : 'Free trial key',
    myKeysTypePremium: isMyanmar ? 'ပရီမီယမ် ပြောင်းလဲသတ်မှတ်သော့' : 'Premium dynamic key',
    myKeysCurrentPoolLabel: isMyanmar ? 'လက်ရှိ ဆာဗာအုပ်စု' : 'Current pool',
    myKeysServerIssue: isMyanmar ? 'ဆာဗာ ပြဿနာ' : 'Server issue',
    myKeysPremiumStatus: isMyanmar ? 'အခြေအနေ' : 'Status',
    myKeysOpenSupport: isMyanmar ? 'အကူအညီ' : 'Support',
    subEmpty: isMyanmar ? '❌ ဤ Telegram အကောင့်နှင့် ချိတ်ထားသော လက်ရှိ အသုံးပြုနိုင်သော သော့ မရှိပါ။' : '❌ No active keys are linked to this Telegram account.',
    subSent: (count: number) => isMyanmar
      ? `📎 မျှဝေစာမျက်နှာ ${count} ခုကို ဤ chat သို့ ပို့ပြီးပါပြီ။`
      : `📎 Sent ${formatTelegramCountLabel(count, locale, 'share page')} to this chat.`,
    noSupportLink: isMyanmar ? 'ℹ️ လက်ရှိ အကူအညီ လင့်ခ် မသတ်မှတ်ရသေးပါ။' : 'ℹ️ No support link is configured right now.',
    supportLabel: isMyanmar ? '🛟 အကူအညီ' : '🛟 Support',
    supportHubTitle: isMyanmar ? '🛟 <b>အကူအညီ စင်တာ</b>' : '🛟 <b>Support center</b>',
    supportHubHint: isMyanmar
      ? 'အော်ဒါ၊ သော့၊ ဆာဗာ ပြဿနာ နှင့် ပရီမီယမ် အကူအညီကို ဒီနေရာကနေ စတင်နိုင်ပါသည်။'
      : 'Start here for order, key, server-issue, and premium support help.',
    supportHubOrdersHint: isMyanmar
      ? '• အော်ဒါ၊ ငွေပေးချေမှု နှင့် စခရင်ရှော့ ပြဿနာကို အောက်က ခလုတ်များမှ စတင်နိုင်ပါသည်။'
      : '• Start order, payment, and screenshot help from the buttons below.',
    supportHubInboxHint: isMyanmar
      ? '• စကားဝိုင်း အခြေအနေများနှင့် အကူအညီ အကြောင်းပြန်ချက်များကို ဒီစင်တာမှ တစ်နေရာတည်းမှာ စစ်နိုင်ပါသည်။'
      : '• Review thread status and support replies here in one place.',
    supportHubPremiumHint: isMyanmar
      ? '• ပရီမီယမ် အသုံးပြုသူများအတွက် /premium, /supportstatus, /premiumregion ကို အသုံးပြုနိုင်ပါသည်။'
      : '• Premium users can continue with /premium, /supportstatus, and /premiumregion.',
    supportHubServerHint: isMyanmar
      ? '• ပုံမှန် သော့ ဆာဗာ ပြဿနာရှိပါက /server ဖြင့် ဆာဗာပြောင်း တောင်းဆိုချက် စတင်ပါ။'
      : '• If a normal-key server has an issue, use /server to start a server-change request.',
    supportHubDirectLink: (supportLink: string) =>
      isMyanmar
        ? `• စီမံခန့်ခွဲသူကို တိုက်ရိုက်ဆက်သွယ်ရန်: ${supportLink}`
        : `• Contact admin directly: ${supportLink}`,
    keyLabel: isMyanmar ? 'သော့' : 'Key',
    serverLabel: isMyanmar ? 'ဆာဗာ' : 'Server',
    statusLineLabel: isMyanmar ? 'အခြေအနေ' : 'Status',
    expirationLabel: isMyanmar ? 'သက်တမ်းကုန်ချိန်' : 'Expiration',
    quotaLabel: isMyanmar ? 'အသုံးပြုခွင့်ပမာဏ' : 'Quota',
    sharePageLabel: isMyanmar ? 'မျှဝေစာမျက်နှာ' : 'Share page',
    subscriptionUrlLabel: isMyanmar ? 'စာရင်းသွင်းလင့်ခ်' : 'Subscription URL',
    clientEndpointLabel: isMyanmar ? 'ကလိုင်းယင့် endpoint' : 'Client endpoint',
    outlineClientUrlLabel: isMyanmar ? 'Outline ကလိုင်းယင့် URL' : 'Outline client URL',
    modeLabel: isMyanmar ? 'မုဒ်' : 'Mode',
    backendsLabel: isMyanmar ? 'Backend များ' : 'Backends',
    coverageLabel: isMyanmar ? 'လွှမ်းခြုံမှု' : 'Coverage',
    idLabel: isMyanmar ? 'အိုင်ဒီ' : 'ID',
    emailLabel: isMyanmar ? 'အီးမေးလ်' : 'Email',
    telegramIdLabel: isMyanmar ? 'Telegram အိုင်ဒီ' : 'Telegram ID',
    requesterLabel: isMyanmar ? 'တောင်းဆိုသူ' : 'Requester',
    serversTitle: isMyanmar ? '🖥 <b>သင့် ဆာဗာများ</b>' : '🖥 <b>Your servers</b>',
    serverChangeTitle: isMyanmar ? '🛠 <b>ဆာဗာပြောင်းရန် သော့ကို ရွေးပါ</b>' : '🛠 <b>Choose a key for server replacement</b>',
    serverChangeDesc: isMyanmar
      ? 'ပုံမှန်သော့များတွင် ဆာဗာ မလုပ်ဆောင်ပါက စီမံခန့်ခွဲသူ စစ်ဆေးမှုဖြင့် အများဆုံး 3 ကြိမ်အထိ ဆာဗာပြောင်းနိုင်ပါသည်။ သက်တမ်းနှင့် အသုံးပြုထားသော ဒေတာပမာဏ မပြောင်းပါ။'
      : 'If a normal key server is not working, the admin can move it to another server up to 3 times. Expiry and used quota stay the same.',
    switchServerTitle: isMyanmar ? '🔄 <b>ဆာဗာပြောင်းရန် သော့ကို ရွေးပါ</b>' : '🔄 <b>Choose a key to switch server</b>',
    switchServerPrompt: (used: number, max: number) =>
      isMyanmar
        ? `🖥 ပြောင်းရွှေ့မည့် ဆာဗာကို ရွေးပါ။\n\nအသုံးပြုထားသော အရေအတွက်: <b>${used}/${max === -1 ? '∞' : max}</b>`
        : `🖥 Choose the target server.\n\nSwitches used: <b>${used}/${max === -1 ? '∞' : max}</b>`,
    switchServerSuccess: (keyName: string, server: string) =>
      isMyanmar
        ? `✅ <b>${keyName}</b> ကို <b>${server}</b> သို့ ပြောင်းလဲပြီးပါပြီ။`
        : `✅ <b>${keyName}</b> has been switched to <b>${server}</b>.`,
    switchServerLimitReached: (keyName: string) =>
      isMyanmar
        ? `⚠️ <b>${keyName}</b> သည် server ပြောင်းလဲခွင့် အရေအတွက် ပြည့်သွားပါပြီ။`
        : `⚠️ <b>${keyName}</b> has reached its server switch limit.`,
    switchServerNotSupported: (keyName: string) =>
      isMyanmar
        ? `ℹ️ <b>${keyName}</b> အတွက် ဆာဗာပြောင်းခြင်းကို မပံ့ပိုးပါ။`
        : `ℹ️ Server switching is not supported for <b>${keyName}</b>.`,
    switchServerAction: isMyanmar ? 'ဆာဗာ ပြောင်းမည်' : 'Switch Server',
    serverChangeKeyLine: (name: string, currentServer: string, remainingChanges: number, limit: number) =>
      isMyanmar
        ? `• <b>${name}</b>\n  လက်ရှိ ဆာဗာ: ${currentServer}\n  ကျန်ရှိသောပြောင်းလဲခွင့်: ${remainingChanges}/${limit}`
        : `• <b>${name}</b>\n  Current server: ${currentServer}\n  Remaining changes: ${remainingChanges}/${limit}`,
    serverChangeNoEligible: isMyanmar
      ? 'ℹ️ ဆာဗာပြောင်းရန် သင့်တော်သော ပုံမှန်သော့ မတွေ့ပါ။'
      : 'ℹ️ No eligible normal keys are available for server replacement.',
    serverChangeLimitReached: (keyName: string) =>
      isMyanmar
        ? `⚠️ <b>${keyName}</b> သည် ဆာဗာပြောင်းလဲခွင့် အများဆုံးအရေအတွက် ရောက်ရှိပြီးပါပြီ။ သော့အသစ် ဝယ်ရန် သို့မဟုတ် စီမံခန့်ခွဲသူကို ဆက်သွယ်ပါ။`
        : `⚠️ <b>${keyName}</b> has reached the server-change limit. Please buy a new key or contact the admin.`,
    serverChangeChooseServer: (keyName: string, currentServer: string, remainingChanges: number, limit: number) =>
      isMyanmar
        ? `🖥 <b>${keyName}</b> အတွက် ပြောင်းရွှေ့မည့် ဆာဗာကို ရွေးပါ။\n\nလက်ရှိ ဆာဗာ: <b>${currentServer}</b>\nကျန်ရှိသောပြောင်းလဲခွင့်: <b>${remainingChanges}/${limit}</b>\n\nအလိုအလျောက် နေရာချမှုက လျှော့ချနေသော ဆာဗာများကို ရှောင်ပါမည်။ သို့သော် သင်က တိုက်ရိုက်ရွေးချယ်ပါက လျှော့ချနေသော ဆာဗာကိုလည်း ဆက်လက်တောင်းဆိုနိုင်ပါသည်။`
        : `🖥 Choose the target server for <b>${keyName}</b>.\n\nCurrent server: <b>${currentServer}</b>\nRemaining changes: <b>${remainingChanges}/${limit}</b>\n\nAuto placement avoids draining servers, but you can still request one here if you choose it explicitly.`,
    serverChangeRequestSubmitted: (code: string, keyName: string, targetServer: string) =>
      isMyanmar
        ? `📨 ဆာဗာပြောင်း တောင်းဆိုချက် <b>${code}</b> ကို ပို့ပြီးပါပြီ။ <b>${keyName}</b> ကို <b>${targetServer}</b> သို့ ပြောင်းရန် စီမံခန့်ခွဲသူ စစ်ဆေးမှုကို စောင့်နေပါသည်။`
        : `📨 Server change request <b>${code}</b> has been submitted. <b>${keyName}</b> is waiting for admin review to move to <b>${targetServer}</b>.`,
    serverChangeStatusTitle: isMyanmar ? '🧾 <b>ဆာဗာပြောင်း တောင်းဆိုချက်</b>' : '🧾 <b>Server change request</b>',
    serverChangeRequestNotFound: isMyanmar ? '❌ ဆာဗာပြောင်း တောင်းဆိုချက်ကို မတွေ့ပါ။' : '❌ Server change request not found.',
    serverChangeRequestPending: (code: string) =>
      isMyanmar
        ? `⏳ ဆာဗာပြောင်း တောင်းဆိုချက် <b>${code}</b> သည် စစ်ဆေးမှုကို စောင့်နေဆဲ ဖြစ်ပါသည်။`
        : `⏳ Server change request <b>${code}</b> is still pending review.`,
    serverChangeRequestApproved: (code: string, keyName: string, targetServer: string) =>
      isMyanmar
        ? `✅ ဆာဗာပြောင်း တောင်းဆိုချက် <b>${code}</b> ကို အတည်ပြုပြီးပါပြီ။ <b>${keyName}</b> ကို <b>${targetServer}</b> သို့ ပြောင်းပြီး အသုံးပြုခွင့်ကို ယခု ပို့ပေးပါမည်။`
        : `✅ Server change request <b>${code}</b> was approved. <b>${keyName}</b> has been moved to <b>${targetServer}</b> and the updated access will be sent next.`,
    serverChangeRequestRejected: (code: string, customerMessage?: string | null, supportLink?: string | null) =>
      isMyanmar
        ? `❌ ဆာဗာပြောင်း တောင်းဆိုချက် <b>${code}</b> ကို ငြင်းပယ်ထားပါသည်။${customerMessage ? `\n\n${customerMessage}` : ''}\n\n${supportLink ? `🛟 အကူအညီ: ${supportLink}` : 'အကူအညီလိုပါက /support ကို အသုံးပြုပါ။'}`
        : `❌ Server change request <b>${code}</b> was rejected.${customerMessage ? `\n\n${customerMessage}` : ''}\n\n${supportLink ? `🛟 Support: ${supportLink}` : 'If you need help, use /support.'}`,
    serverChangeReviewAlertTitle: isMyanmar ? '🛠 <b>ဆာဗာပြောင်း တောင်းဆိုချက်</b>' : '🛠 <b>Server change request</b>',
    serverChangeReviewReminderTitle: isMyanmar ? '⏰ <b>စောင့်နေသော ဆာဗာပြောင်း တောင်းဆိုချက်</b>' : '⏰ <b>Pending server change request</b>',
    serverChangeReviewPanelLabel: isMyanmar ? 'စီမံခန့်ခွဲမှု စာမျက်နှာတွင် စစ်မည်' : 'Review in panel',
    serverChangeApproveActionLabel: isMyanmar ? 'အတည်ပြုမည်' : 'Approve',
    serverChangeRejectActionLabel: isMyanmar ? 'ပယ်မည်' : 'Reject',
    serverChangeReviewActionApproved: (code: string) =>
      isMyanmar ? `${code} ကို အတည်ပြုပြီးပါပြီ` : `${code} approved`,
    serverChangeReviewActionRejected: (code: string) =>
      isMyanmar ? `${code} ကို ပယ်လိုက်ပါပြီ` : `${code} rejected`,
    serverChangeReviewActionUnauthorized: isMyanmar ? 'ဤ action ကို admin များသာ အသုံးပြုနိုင်ပါသည်။' : 'Only admins can use this action.',
    serverChangeReviewActionFailed: (message: string) =>
      isMyanmar ? `Action မအောင်မြင်ပါ: ${message}` : `Action failed: ${message}`,
    serverChangeCancelled: isMyanmar ? 'ဆာဗာပြောင်း တောင်းဆိုချက်ကို ပယ်ဖျက်လိုက်ပါပြီ။' : 'Server change request cancelled.',
    serverChangeNoAlternateServers: isMyanmar
      ? 'ℹ️ ဤ key အတွက် ရွေးချယ်ရန် အခြား assignable server မရှိပါ။'
      : 'ℹ️ There are no other assignable servers available for this key.',
    serverChangeRequestCodeLabel: isMyanmar ? 'တောင်းဆိုချက်' : 'Request',
    currentServerLabel: isMyanmar ? 'လက်ရှိ ဆာဗာ' : 'Current server',
    requestedServerLabel: isMyanmar ? 'ရွေးထားသော ဆာဗာ' : 'Requested server',
    remainingChangesLabel: isMyanmar ? 'ကျန်ရှိသောပြောင်းလဲခွင့်' : 'Remaining changes',
    serverChangeSupportDefault: isMyanmar
      ? 'ဤသော့ကို ပြန်လည်စစ်ဆေးရန် စီမံခန့်ခွဲသူ သို့မဟုတ် အကူအညီအဖွဲ့ကို ဆက်သွယ်ပေးပါ။'
      : 'Please contact admin/support for follow-up on this key.',
    renewNoMatch: (query: string) => isMyanmar ? `❌ "${query}" နှင့် ကိုက်ညီသော linked key မရှိပါ။` : `❌ No linked key matched "${query}".`,
    renewSent: (count: number) => isMyanmar
      ? `✅ သော့ ${count} ခုအတွက် သက်တမ်းတိုးရန် တောင်းဆိုချက် ပို့ပြီးပါပြီ။ စီမံခန့်ခွဲသူကို အသိပေးထားပါသည်။`
      : `✅ Renewal request sent for ${formatTelegramCountLabel(count, locale, 'key')}. An administrator has been notified.`,
    buyDisabled: isMyanmar ? 'ℹ️ ယခုအချိန်တွင် Telegram မှ သော့အသစ် မမှာယူနိုင်သေးပါ။' : 'ℹ️ New key orders are not available through Telegram right now.',
    buyStandardSummary: isMyanmar
      ? '🔑 <b>ပုံမှန်သော့</b>\nပုံမှန်အသုံးပြုမှုအတွက် သင့်တော်ပြီး စျေးနှုန်းသက်သာသော ရွေးချယ်မှုဖြစ်ပါသည်။ ပုံမှန်အားဖြင့် ရွေးထားသော ဆာဗာတစ်ခုအပေါ် အခြေခံပါသည်။'
      : '🔑 <b>Standard key</b>\nA lower-cost option for normal daily use. It usually stays on the server you choose.',
    buyPremiumSummary: isMyanmar
      ? '💎 <b>ပရီမီယမ်သော့</b>\nဒိုင်နမစ် လမ်းကြောင်းရွေးချယ်မှု၊ ပိုတည်ငြိမ်မှု၊ အလိုအလျောက် ပြန်လည်ပြောင်းရွှေ့မှု နှင့် ဦးစားပေး အကူအညီတို့အတွက် ပြုလုပ်ထားသော အစီအစဉ်ဖြစ်ပါသည်။'
      : '💎 <b>Premium key</b>\nBuilt for users who want dynamic routing, stronger stability, auto failover, and priority support.',
    buyStandardBestFor: isMyanmar
      ? 'အသုံးပြုမှု ပုံမှန်၊ စျေးနှုန်းသက်သာမှု လိုသူများအတွက် သင့်တော်ပါသည်။'
      : 'Best for lower-cost, normal daily use.',
    buyPremiumBestFor: isMyanmar
      ? 'ပိုတည်ငြိမ်သော လမ်းကြောင်း၊ အရန်ပြောင်းရွှေ့မှု နှင့် ဒေသရွေးချယ်နိုင်မှု လိုသူများအတွက် သင့်တော်ပါသည်။'
      : 'Best for users who want stronger routing stability, fallback, and region flexibility.',
    buyPremiumRegionExplain: isMyanmar
      ? 'ဝယ်ပြီးနောက် ဦးစားပေး ဒေသတောင်းဆိုမှု၊ လမ်းကြောင်း ပြဿနာ အစီရင်ခံမှု နှင့် /premiumregion အခြေအနေ စစ်ခြင်းတို့ကို အသုံးပြုနိုင်ပါသည်။'
      : 'After purchase, you can request a preferred region, report route issues, and check live region health with /premiumregion.',
    buyPlanCardChooseHint: isMyanmar
      ? 'အောက်က ခလုတ်ကို နှိပ်ပြီး အစီအစဉ်ကို တိုက်ရိုက်ရွေးနိုင်ပါသည်။'
      : 'Tap a button below to choose one of these plans directly.',
    buyPlanChooseHint: isMyanmar
      ? 'မှာယူမှု လုပ်ငန်းစဉ်က ရိုးရှင်းပါသည် - 1) အစီအစဉ် ရွေးရန် 2) ဆာဗာ / ငွေပေးချေမှု နည်းလမ်း ရွေးရန် 3) စခရင်ရှော့ ပို့ရန် 4) စီမံခန့်ခွဲသူ အတည်ပြုချက် စောင့်ရန်။'
      : 'Checkout is simple: 1) choose a plan 2) choose server/payment 3) send your screenshot 4) wait for admin approval.',
    buyStandardPlansTitle: isMyanmar ? 'ပုံမှန် အစီအစဉ်များ' : 'Standard packages',
    buyPremiumPlansTitle: isMyanmar ? 'ပရီမီယမ် အစီအစဉ်များ' : 'Premium packages',
    buyPremiumUpsell: isMyanmar
      ? 'ပရီမီယမ်ကို ရွေးချယ်ပါက ပိုတည်ငြိမ်သော လင့်ခ်၊ ဒေသရွေးချယ်နိုင်မှု နှင့် ပိုကောင်းသော အကူအညီ ရရှိပါမည်။'
      : 'Choose Premium if you want a more stable link, better region flexibility, and stronger support.',
    renewDisabled: isMyanmar ? 'ℹ️ ယခုအချိန်တွင် Telegram မှ renewal မလုပ်နိုင်သေးပါ။' : 'ℹ️ Renewals are not available through Telegram right now.',
    activeOrderPendingReview: (code: string) =>
      isMyanmar
        ? `⏳ အော်ဒါ <b>${code}</b> ကို စစ်ဆေးမှု စောင့်နေဆဲဖြစ်ပါသည်။\nစခရင်ရှော့ အသစ် မပို့ပါနှင့်။ အတည်ပြုပြီးနောက် အသုံးပြုခွင့်ကို ဒီ chat ထဲ ပို့ပေးပါမည်။`
        : `⏳ Order <b>${code}</b> is under review.\nDo not send another screenshot. Access will be sent here after approval.`,
    orderCancelled: (code: string) =>
      isMyanmar
        ? `🛑 Order <b>${code}</b> ကို ပယ်ဖျက်ပြီးပါပြီ။`
        : `🛑 Order <b>${code}</b> has been cancelled.`,
    noOrderToCancel: isMyanmar ? 'ℹ️ ပယ်ဖျက်ရန် Telegram အော်ဒါ စောင့်ဆိုင်းနေမှု မရှိပါ။' : 'ℹ️ There is no pending Telegram order to cancel.',
    paymentProofRequired: isMyanmar
      ? '🧾 ငွေပေးချေမှု စခရင်ရှော့ကို ဒီ chat ထဲ photo သို့မဟုတ် document အဖြစ် ပို့ပေးပါ။\nငွေပမာဏ၊ transfer ID နှင့် အချိန်ကို ရှင်းလင်းစွာ မြင်ရပါမည်။'
      : '🧾 Send your payment screenshot here as a photo or document.\nAmount, transfer ID, and time must be clearly visible.',
    orderPlanPrompt: (code: string) =>
      isMyanmar
        ? `🛒 <b>Order ${code}</b>\n\nသင့်အသုံးပြုမှုပုံစံနှင့် ကိုက်ညီသော package ကို ရွေးပါ။ Button ကိုနှိပ်နိုင်သလို နံပါတ်ဖြင့် reply လည်း လုပ်နိုင်ပါသည်။`
        : `🛒 <b>Order ${code}</b>\n\nChoose the package that best fits your usage. You can tap a button or reply with the plan number.`,
    orderMonthsPrompt: isMyanmar
      ? '📆 အကန့်အသတ်မရှိ အစီအစဉ်အတွက် လအရေအတွက်ကို ပို့ပါ။ အနည်းဆုံး 3 လ ဖြစ်ရပါမည်။'
      : '📆 Send the number of months for the unlimited plan. The minimum is 3 months.',
    orderServerPrompt: (code: string) =>
      isMyanmar
        ? `🖥 <b>Order ${code}</b>\n\nအသုံးပြုလိုသော ဆာဗာကို ရွေးပါ။ Auto ကို ရွေးပါက စနစ်မှ သင့်တော်သော ဆာဗာကို အလိုအလျောက် ရွေးပေးပြီး လျှော့ချနေသော ဆာဗာများကို ရှောင်ပါမည်။ သင်က တိုက်ရိုက်ရွေးချယ်ပါက လျှော့ချနေသော ဆာဗာကိုလည်း အသုံးပြုနိုင်ပါသည်။`
        : `🖥 <b>Order ${code}</b>\n\nChoose the server you prefer. Pick Auto if you want the system to choose a suitable server and avoid draining servers. If you pick a server yourself, you can still use a draining server.`,
    serverDrainingBadge: isMyanmar ? 'လျှော့ချနေသည်' : 'Draining',
    orderNamePrompt: isMyanmar
      ? '✍️ သော့ကတ်ပေါ်တွင် ပြမည့် အမည်ကို ပို့ပါ။ ဥပမာ - John iPhone 15'
      : '✍️ Send the name that should appear on the key card. Example: John iPhone 15',
    orderPaymentMethodPrompt: (code: string) =>
      isMyanmar
        ? `💳 <b>Order ${code}</b>\n\nအသုံးပြုမည့် ငွေပေးချေမှု နည်းလမ်းကို ရွေးပါ။ ခလုတ်ကို နှိပ်နိုင်သလို နံပါတ်ဖြင့် reply လည်း လုပ်နိုင်ပါသည်။`
        : `💳 <b>Order ${code}</b>\n\nChoose the payment method you will use. You can tap a button or reply with the number.`,
    renewTargetPrompt: (code: string) =>
      isMyanmar
        ? `🔄 <b>Renewal ${code}</b>\n\nသက်တမ်းတိုးလိုသော သော့ကို ရွေးပါ။ ခလုတ်ကို နှိပ်နိုင်သလို နံပါတ်ဖြင့် reply လည်း လုပ်နိုင်ပါသည်။`
        : `🔄 <b>Renewal ${code}</b>\n\nChoose the key you want to renew. You can tap a button or reply with the number.`,
    invalidPlanChoice: isMyanmar ? '❌ စာရင်းထဲက အစီအစဉ် နံပါတ်တစ်ခုကို ရွေးပေးပါ။' : '❌ Reply with one of the listed plan numbers.',
    invalidMonths: isMyanmar ? '❌ လအရေအတွက်ကို 3 နှင့်အထက် ဂဏန်းဖြင့် ပို့ပေးပါ။' : '❌ Send a number of months that is 3 or greater.',
    invalidRenewChoice: isMyanmar ? '❌ စာရင်းထဲက key နံပါတ်ကို ပို့ပေးပါ။' : '❌ Reply with one of the key numbers from the list.',
    invalidServerChoice: isMyanmar ? '❌ စာရင်းထဲက server တစ်ခုကို ရွေးပေးပါ။' : '❌ Reply with one of the listed servers.',
    invalidPaymentMethodChoice: isMyanmar
      ? '❌ စာရင်းထဲက ငွေပေးချေမှု နည်းလမ်းတစ်ခုကို ရွေးပေးပါ။'
      : '❌ Reply with one of the listed payment methods.',
    invalidOrderName: isMyanmar ? '❌ သော့အမည်ကို စာလုံး 2 လုံးမှ 100 လုံးအတွင်း ပို့ပေးပါ။' : '❌ Send a key name between 2 and 100 characters.',
    freeTrialUnavailable: isMyanmar
      ? 'ℹ️ အခမဲ့ အစမ်းသုံးခွင့်ကို အသုံးပြုသူအသစ် တစ်ဦးအတွက် တစ်ကြိမ်သာ ရရှိနိုင်ပါသည်။'
      : 'ℹ️ The free trial is only available once for each new user.',
    orderProofPending: (code: string) =>
      isMyanmar
        ? `📨 Order <b>${code}</b> အတွက် ငွေပေးချေမှု အထောက်အထားကို လက်ခံပြီးပါပြီ။\nစီမံခန့်ခွဲသူ စစ်ဆေးမှုကို စောင့်နေပါသည်။ အတည်ပြုပြီးနောက် သော့ကို ဒီ chat ထဲ ပို့ပေးပါမည်။`
        : `📨 Payment proof received for order <b>${code}</b>.\nNow waiting for admin review. Your key will be sent here after approval.`,
    orderPaymentMethodReminder: (code: string) =>
      isMyanmar
        ? `⏰ Order <b>${code}</b> သည် payment method မရွေးရသေးပါ။ ဆက်လက်လုပ်ဆောင်ရန် နည်းလမ်းတစ်ခုကို ရွေးပေးပါ။`
        : `⏰ Order <b>${code}</b> is still waiting for a payment method. Choose one to continue.`,
    orderPaymentProofReminder: (code: string) =>
      isMyanmar
        ? `⏰ Order <b>${code}</b> သည် payment screenshot စောင့်နေပါသည်။\nငွေပေးချေပြီးဖြစ်ပါက ဒီ chat ထဲ screenshot ပို့ပေးပါ။`
        : `⏰ Order <b>${code}</b> is still waiting for your payment screenshot.\nIf you already paid, send it in this chat.`,
    orderRejectedFollowUpReminder: (code: string) =>
      isMyanmar
        ? `ℹ️ Order <b>${code}</b> ကို ယခင်က ပယ်ထားပြီးဖြစ်ပါသည်။\nRetry ကို နှိပ်ပြီး screenshot အသစ်တင်ပါ သို့မဟုတ် /support ကို အသုံးပြုပါ။`
        : `ℹ️ Order <b>${code}</b> was rejected earlier.\nTap retry to upload a new screenshot, or use /support.`,
    orderRejectedFollowUpNote: isMyanmar
      ? 'Rejected order အတွက် follow-up reminder ကို ပို့ခဲ့သည်။'
      : 'Sent a follow-up reminder for this rejected order.',
    orderRetryReminder: (code: string) =>
      isMyanmar
        ? `⏰ Retry order <b>${code}</b> သည် မပြီးသေးပါ။ ဆက်လုပ်လိုပါက payment method ကို ပြန်ရွေးပါ သို့မဟုတ် screenshot ကို တင်ပေးပါ။`
        : `⏰ Retry order <b>${code}</b> is still incomplete. Choose your payment method or upload your screenshot to continue.`,
    orderRetryReminderNote: isMyanmar
      ? 'Retry order အတွက် follow-up reminder ကို ပို့ခဲ့သည်။'
      : 'Sent a follow-up reminder for this retry order.',
    orderExpiredUnpaid: (code: string) =>
      isMyanmar
        ? `⌛ Order <b>${code}</b> ကို ငွေပေးချေမှု မပြီးစီးသေးသဖြင့် အလိုအလျောက် ပိတ်လိုက်ပါပြီ။ အဆင်သင့်ဖြစ်သည့်အချိန်တွင် /buy သို့မဟုတ် /renew ဖြင့် ပြန်စနိုင်ပါသည်။`
        : `⌛ Order <b>${code}</b> expired because payment was not completed in time. Start again with /buy or /renew when you're ready.`,
    orderExpiredUnpaidNote: isMyanmar
      ? 'Payment မပြီးစီးသေးသဖြင့် order ကို အလိုအလျောက် ပိတ်လိုက်ပါသည်။'
      : 'This order was automatically cancelled because payment was not completed in time.',
    trialExpiringTitle: isMyanmar
      ? '🎁 <b>သင့် free trial မကြာမီ ကုန်ဆုံးမည်</b>'
      : '🎁 <b>Your free trial will expire soon</b>',
    trialExpiringBody: (hoursLeft: number) =>
      isMyanmar
        ? `လက်ရှိ free trial ကို အသုံးပြုနိုင်ရန် ${hoursLeft} နာရီခန့်သာ ကျန်ပါသည်။`
        : `${hoursLeft} hour(s) left on your free trial.`,
    trialExpiringUpsell: isMyanmar
      ? 'ဆက်သုံးလိုပါက အောက်ပါ ခလုတ်ဖြင့် အခပေး အစီအစဉ်ကို ရွေးပါ။'
      : 'Choose a paid plan below to keep access.',
    trialCouponTitle: isMyanmar
      ? '🏷 <b>Trial offer ready</b>'
      : '🏷 <b>Trial offer ready</b>',
    trialCouponBody: (hoursLeft: number) =>
      isMyanmar
        ? `Free trial မကုန်မီ ${hoursLeft} နာရီခန့် ကျန်နေပါသည်။`
        : `${hoursLeft} hour(s) left before the free trial ends.`,
    trialCouponOffer: (code: string, label: string) =>
      isMyanmar
        ? `Coupon <b>${code}</b> • ${label}`
        : `Coupon <b>${code}</b> • ${label}`,
    trialCouponHint: isMyanmar
      ? 'Buy new key ကို နှိပ်ပါ။ Coupon ကို checkout ထဲတွင် အလိုအလျောက် သုံးပေးပါမည်။'
      : 'Tap Buy new key. The coupon applies in checkout.',
    renewalCouponTitle: isMyanmar
      ? '🔁 <b>Renewal coupon ready</b>'
      : '🔁 <b>Renewal coupon ready</b>',
    renewalCouponBody: (daysLeft: number) =>
      isMyanmar
        ? `သင့် key သက်တမ်းကုန်ရန် ${daysLeft} ရက်ခန့် ကျန်ပါသည်။`
        : `${daysLeft} day(s) left on this key.`,
    premiumUpsellCouponTitle: isMyanmar
      ? '💎 <b>ပရီမီယမ် အဆင့်မြှင့် အထူးကမ်းလှမ်းချက်</b>'
      : '💎 <b>Premium upgrade offer</b>',
    premiumUpsellCouponBody: (usagePercent: number) =>
      isMyanmar
        ? `လက်ရှိ standard key အသုံးပြုမှုသည် ${usagePercent}% ရှိနေပါသည်။`
        : `This standard key is at ${usagePercent}% usage.`,
    winbackCouponTitle: isMyanmar
      ? '🎉 <b>Welcome back offer</b>'
      : '🎉 <b>Welcome back offer</b>',
    winbackCouponBody: (inactiveDays: number) =>
      isMyanmar
        ? `${inactiveDays} ရက်ခန့် အော်ဒါအသစ် မလုပ်သေးပါ။`
        : `${inactiveDays} day(s) since your last paid order.`,
    couponReadyHint: isMyanmar
      ? 'အောက်ပါ button ကို နှိပ်ပါ သို့မဟုတ် coupon code ဖြင့် စတင်နိုင်ပါသည်။'
      : 'Use the button below or start with the coupon code.',
    couponUnavailableExpired: (code?: string | null) =>
      isMyanmar
        ? `⌛ ${code ? `Coupon <b>${code}</b>` : 'ဤ coupon'} သည် သက်တမ်းကုန်သွားပါပြီ။`
        : `⌛ ${code ? `Coupon <b>${code}</b>` : 'This coupon'} has expired.`,
    couponUnavailableRevoked: (code?: string | null) =>
      isMyanmar
        ? `🚫 ${code ? `Coupon <b>${code}</b>` : 'ဤ coupon'} ကို မရရှိနိုင်တော့ပါ။`
        : `🚫 ${code ? `Coupon <b>${code}</b>` : 'This coupon'} is no longer available.`,
    couponUnavailableConsumed: (code?: string | null) =>
      isMyanmar
        ? `✅ ${code ? `Coupon <b>${code}</b>` : 'ဤ coupon'} ကို အသုံးပြုပြီးဖြစ်သောကြောင့် ထပ်မံအသုံးမပြုနိုင်တော့ပါ။`
        : `✅ ${code ? `Coupon <b>${code}</b>` : 'This coupon'} was already used and cannot be applied again.`,
    couponUnavailableBlocked: (code?: string | null) =>
      isMyanmar
        ? `${code ? `Coupon <b>${code}</b>` : 'ဤ promo'} ကို ဤ account အတွက် admin မှ လောလောဆယ် ပိတ်ထားပါသည်။`
        : `${code ? `Coupon <b>${code}</b>` : 'This promo'} is currently blocked for this account by the admin.`,
    couponUnavailableNotFound: (code?: string | null) =>
      isMyanmar
        ? `${code ? `Coupon <b>${code}</b>` : 'ဤ coupon'} ကို မတွေ့ပါ။`
        : `${code ? `Coupon <b>${code}</b>` : 'This coupon'} was not found.`,
    couponUnavailableContinueHint: isMyanmar
      ? 'Discount မရှိဘဲ ဆက်လက်ရွေးချယ်နိုင်ပါသည်။ အကူအညီလိုပါက /support ကို အသုံးပြုပါ။'
      : 'You can continue without the discount, or use /support if you need help.',
    orderRejected: (code: string, customerMessage?: string | null, supportLink?: string | null) =>
      isMyanmar
        ? `❌ Order <b>${code}</b> ကို ငြင်းပယ်ထားပါသည်။${customerMessage ? `\n\n${customerMessage}` : ''}\n\n/buy သို့မဟုတ် /renew ဖြင့် screenshot အသစ်တင်ပြီး ပြန်စနိုင်ပါသည်။${supportLink ? `\n🛟 အကူအညီ: ${supportLink}` : '\nအကူအညီလိုပါက /support ကို အသုံးပြုပါ။'}`
        : `❌ Order <b>${code}</b> was rejected.${customerMessage ? `\n\n${customerMessage}` : ''}\n\nStart again with /buy or /renew and upload a new screenshot.${supportLink ? `\n🛟 Support: ${supportLink}` : '\nUse /support if you need help.'}`,
    orderApproved: (code: string) =>
      isMyanmar
        ? `✅ Order <b>${code}</b> ကို အတည်ပြုပြီးပါပြီ။\nAccess details ကို နောက်မက်ဆေ့ခ်ျတွင် ပို့ပါမည်။`
        : `✅ Order <b>${code}</b> has been approved.\nAccess details are in the next message.`,
    receiptTitle: isMyanmar ? '🧾 <b>ငွေပေးချေမှု အတည်ပြုလက်ခံစာ</b>' : '🧾 <b>Payment receipt</b>',
    refundReceiptTitle: isMyanmar ? '🧾 <b>Refund အတည်ပြုချက်</b>' : '🧾 <b>Refund confirmation</b>',
    receiptNumberLabel: isMyanmar ? 'ပြေစာ' : 'Receipt',
    receiptTypeLabel: isMyanmar ? 'အမျိုးအစား' : 'Type',
    receiptStatusPaid: isMyanmar ? 'ငွေပေးချေပြီး ပို့ပြီး' : 'Paid & delivered',
    receiptStatusTrial: isMyanmar ? 'အခမဲ့ အစမ်းသော့ ပို့ပြီး' : 'Free trial delivered',
    receiptTypeStandard: isMyanmar ? 'ပုံမှန်သော့' : 'Standard key',
    receiptTypePremium: isMyanmar ? 'Premium ပြောင်းလဲသတ်မှတ်သော့' : 'Premium dynamic key',
    receiptTypeTrial: isMyanmar ? 'အခမဲ့ အစမ်းသော့' : 'Free trial key',
    receiptFooter: isMyanmar
      ? 'Share page နှင့် setup details ကို နောက်မက်ဆေ့ခ်ျတွင် ဆက်ပို့ပါမည်။'
      : 'The share page and setup details are in the next message.',
    receiptActionPrintable: isMyanmar ? 'ပရင့်ထုတ်နိုင်သော ပြေစာ' : 'Printable receipt',
    receiptActionDownloadPdf: isMyanmar ? 'PDF ဒေါင်းလုဒ်' : 'Download PDF',
    orderSupportHint: isMyanmar
      ? 'အတည်ပြုမခံရသေးခင် မည်သည့်အချိန်မဆို /cancel ဖြင့် လက်ရှိ order ကို ပယ်ဖျက်နိုင်ပါသည်။'
      : 'Before approval, you can cancel the current order at any time with /cancel.',
    orderActionPayNow: isMyanmar ? 'ငွေပေးချေမှု လမ်းညွှန်' : 'Pay now',
    orderActionAlreadyPaid: isMyanmar ? 'ငွေပေးချေပြီးပါပြီ' : 'I already paid',
    orderActionViewPaymentGuide: isMyanmar ? 'ငွေပေးချေမှု လမ်းညွှန်' : 'Payment guide',
    orderActionUploadProof: isMyanmar ? 'စခရင်ရှော့ ပို့ရန်' : 'Upload screenshot',
    orderActionReplaceProof: isMyanmar ? 'စခရင်ရှော့ အသစ်နဲ့ အစားထိုးရန်' : 'Replace screenshot',
    orderActionCheckStatus: isMyanmar ? 'အခြေအနေ စစ်ရန်' : 'Check status',
    orderActionRequestRefund: isMyanmar ? 'ငွေပြန်အမ်းမှု တောင်းဆိုရန်' : 'Request refund',
    orderActionCancel: isMyanmar ? 'အော်ဒါ ပယ်ရန်' : 'Cancel order',
    orderActionRetryOrder: isMyanmar ? 'အော်ဒါကို ဆက်လုပ်ရန်' : 'Retry order',
    orderActionRestartSamePlan: isMyanmar ? 'တူညီသော အစီအစဉ်နဲ့ ပြန်စရန်' : 'Restart same plan',
    orderActionBuyNewKey: isMyanmar ? 'အသစ်ဝယ်ရန်' : 'Buy new key',
    orderActionRenewKey: isMyanmar ? 'ဤ key ကို သက်တမ်းတိုးရန်' : 'Renew this key',
    orderActionChoosePlan: isMyanmar ? 'အစီအစဉ် ရွေးရန်' : 'Choose plan',
    orderActionSelectKey: isMyanmar ? 'သော့ ရွေးရန်' : 'Select key',
    orderActionSelectServer: isMyanmar ? 'ဆာဗာ ရွေးရန်' : 'Choose server',
    orderActionChoosePaymentMethod: isMyanmar ? 'ငွေပေးချေမှု နည်းလမ်း ရွေးရန်' : 'Choose payment method',
    orderActionSwitchPaymentMethod: isMyanmar ? 'ငွေပေးချေမှု နည်းလမ်း ပြောင်းရန်' : 'Switch payment method',
    orderActionSelectedPlan: (label: string) =>
      isMyanmar ? `ရွေးထားသော အစီအစဉ်: ${label}` : `Selected plan: ${label}`,
    orderActionSelectedKey: (label: string) =>
      isMyanmar ? `ရွေးထားသော သော့: ${label}` : `Selected key: ${label}`,
    orderActionSelectedServer: (label: string) =>
      isMyanmar ? `ရွေးထားသော ဆာဗာ: ${label}` : `Selected server: ${label}`,
    orderActionSelectedPaymentMethod: (label: string) =>
      isMyanmar ? `ရွေးထားသော ငွေပေးချေမှု နည်းလမ်း: ${label}` : `Selected payment method: ${label}`,
    orderActionCancelledInline: (code: string) =>
      isMyanmar ? `အော်ဒါ ${code} ကို ပယ်ဖျက်ပြီးပါပြီ။` : `Cancelled order ${code}.`,
    orderActionRetryStarted: (code: string) =>
      isMyanmar ? `အော်ဒါ ${code} ကို ဆက်လုပ်ရန် ပြင်ဆင်ပြီးပါပြီ။` : `Prepared order ${code} to continue.`,
    orderActionAlreadyClosed: isMyanmar ? 'ဤအော်ဒါကို ပိတ်ပြီး ဖြစ်ပါသည်။' : 'This order is already closed.',
    orderActionNotReadyForPayment: isMyanmar
      ? 'ဤအော်ဒါသည် ငွေပေးချေမှု စခရင်ရှော့ ပို့ရန် အဆင့်သို့ မရောက်သေးပါ။'
      : 'This order is not ready for payment proof yet.',
    orderActionStatusMissing: isMyanmar ? 'အော်ဒါကို မတွေ့ပါ။' : 'Order not found.',
    orderActionSent: isMyanmar ? 'အသေးစိတ်ကို Telegram တွင် ပို့ပြီးပါပြီ။' : 'Details sent in Telegram.',
    refundPolicySummary: isMyanmar
      ? 'ငွေပြန်အမ်းမှုကို ငွေပေးချေပြီး ပြီးစီးသော အော်ဒါများအတွက်သာ တောင်းဆိုနိုင်ပြီး paid purchase ၃ ကြိမ်ကျော်ရမည်။ အသုံးပြုမှု 5 GB ကျော်သွားလျှင် ငွေပြန်အမ်းမှု မရနိုင်တော့ပါ။'
      : 'Refund opens only for fulfilled paid orders after more than 3 paid purchases, and closes automatically above 5 GB of usage.',
    refundEligibleOrdersTitle: isMyanmar
      ? '💸 <b>ငွေပြန်အမ်းမှု တောင်းဆိုနိုင်သော အော်ဒါများ</b>'
      : '💸 <b>Refund-eligible orders</b>',
    refundEligibleOrdersHint: isMyanmar
      ? 'အောက်ပါ အော်ဒါကတ်များမှ ငွေပြန်အမ်းမှု တောင်းဆိုချက်ကို တင်နိုင်ပါသည်။'
      : 'Use the order cards below to request a refund.',
    refundNoEligibleOrders: isMyanmar
      ? 'ငွေပြန်အမ်းမှု တောင်းဆိုနိုင်သော အော်ဒါ မရှိသေးပါ။ Paid purchase ၃ ကြိမ်ကျော်ပြီး fulfilled order ဖြစ်ရမည်၊ အသုံးပြုမှု 5 GB အောက်တွင် ရှိရမည်။'
      : 'There are no refund-eligible orders right now. You need more than 3 paid purchases, a fulfilled paid order, and usage at or below 5 GB.',
    refundRequestStatusLabel: isMyanmar ? 'ငွေပြန်အမ်းမှု တောင်းဆိုချက်' : 'Refund request',
    refundRequestedAtLabel: isMyanmar ? 'ငွေပြန်အမ်းမှု တောင်းဆိုချိန်' : 'Refund requested',
    refundReviewedAtLabel: isMyanmar ? 'ငွေပြန်အမ်းမှု စစ်ဆေးချိန်' : 'Refund reviewed',
    refundReasonLabel: isMyanmar ? 'ငွေပြန်အမ်းမှု အကြောင်းရင်း' : 'Refund reason',
    refundStatusPending: isMyanmar ? 'စောင့်ဆိုင်းနေသည်' : 'Pending review',
    refundStatusApproved: isMyanmar ? 'အတည်ပြုပြီး' : 'Approved',
    refundStatusRejected: isMyanmar ? 'ငြင်းပယ်ထားသည်' : 'Rejected',
    refundPendingHelp: isMyanmar
      ? 'ငွေပြန်အမ်းမှု တောင်းဆိုချက်ကို ဘဏ္ဍာရေး စစ်ဆေးမှု စောင့်နေပါသည်။ အခြေအနေပြောင်းလဲသည့်အခါ ဤ chat မှာ အပ်ဒိတ် ရပါမည်။'
      : 'Your refund request is waiting for finance review. You will get an update here when the status changes.',
    refundApprovedHelp: isMyanmar
      ? 'ငွေပြန်အမ်းမှုကို ဘဏ္ဍာရေးအဖွဲ့မှ မှတ်တမ်းတင်ပြီးပါပြီ။ နောက်ထပ် အသေးစိတ်လိုပါက /support ကို အသုံးပြုပါ။'
      : 'The refund has been recorded by the finance team. Use /support if you need more details.',
    refundRejectedHelp: isMyanmar
      ? 'ငွေပြန်အမ်းမှု တောင်းဆိုချက်ကို မအတည်ပြုနိုင်သေးပါ။ လိုအပ်ပါက စီမံခန့်ခွဲသူ သို့မဟုတ် အကူအညီအဖွဲ့ကို ဆက်သွယ်နိုင်ပါသည်။'
      : 'This refund request was not approved. Contact admin/support if you need more help.',
    refundCenterTitle: isMyanmar ? '💸 <b>ငွေပြန်အမ်းမှု စင်တာ</b>' : '💸 <b>Refund center</b>',
    refundRecentRequestsTitle: isMyanmar
      ? 'လက်ရှိ ငွေပြန်အမ်းမှု တောင်းဆိုချက် အခြေအနေ'
      : 'Recent refund request status',
    refundEligibleSectionTitle: isMyanmar
      ? 'ငွေပြန်အမ်းမှု တောင်းဆိုနိုင်သော အော်ဒါများ'
      : 'Eligible orders you can request now',
    refundAlreadyRequested: (code: string) =>
      isMyanmar
        ? `ငွေပြန်အမ်းမှု တောင်းဆိုချက်အတွက် အော်ဒါ <b>${code}</b> ကို စောင့်ဆိုင်းနေပါသည်။`
        : `Order <b>${code}</b> already has a pending refund request.`,
    refundRequested: (code: string) =>
      isMyanmar
        ? `💸 အော်ဒါ <b>${code}</b> အတွက် ငွေပြန်အမ်းမှု တောင်းဆိုချက်ကို ပို့ပြီးပါပြီ။\nစစ်ဆေးပြီးသည်နှင့် ဒီ chat မှာ အပ်ဒိတ် ပို့ပေးပါမည်။`
        : `💸 Refund request sent for order <b>${code}</b>.\nWe will update you here after review.`,
    refundRequestRejected: (code: string, customerMessage?: string | null) =>
      isMyanmar
        ? `❌ အော်ဒါ <b>${code}</b> အတွက် ငွေပြန်အမ်းမှု တောင်းဆိုချက်ကို မအတည်ပြုနိုင်ပါ။${customerMessage ? `\n\n${customerMessage}` : ''}`
        : `❌ Refund not approved for order <b>${code}</b>.${customerMessage ? `\n\n${customerMessage}` : ''}`,
    refundRequestApproved: (code: string, customerMessage?: string | null) =>
      isMyanmar
        ? `✅ အော်ဒါ <b>${code}</b> အတွက် ငွေပြန်အမ်းမှုကို အတည်ပြုပြီးပါပြီ။${customerMessage ? `\n\n${customerMessage}` : ''}`
        : `✅ Refund approved for order <b>${code}</b>.${customerMessage ? `\n\n${customerMessage}` : ''}`,
    myKeysRenewHint: isMyanmar
      ? 'ကတ်တစ်ခုချင်းစီ၏ အောက်ပါ ခလုတ်များမှ မျှဝေစာမျက်နှာ ဖွင့်ခြင်း၊ သက်တမ်းတိုးခြင်း၊ ဆာဗာပြဿနာ တင်ခြင်းနှင့် အကူအညီ ရယူခြင်းတို့ကို တိုက်ရိုက် ပြုလုပ်နိုင်ပါသည်။'
      : 'Use the buttons below each card to open the share page, renew, report a server issue, or contact support directly.',
    renewShortcutUsed: (keyName: string) =>
      isMyanmar
        ? `🔄 <b>${keyName}</b> အတွက် renewal ကို တိုက်ရိုက် စတင်လိုက်ပါပြီ။`
        : `🔄 Started a direct renewal for <b>${keyName}</b>.`,
    renewDirectHint: isMyanmar
      ? 'သော့ တစ်ခုသာ ရှိသောကြောင့် သက်တမ်းတိုးမည့် ပစ်မှတ်ကို အလိုအလျောက် ရွေးပြီး အစီအစဉ် ရွေးရန် တိုက်ရိုက် ဖွင့်လိုက်ပါသည်။'
      : 'Only one linked key was found, so the renewal target was preselected automatically.',
    renewalBenefitsStandard: isMyanmar
      ? 'သက်တမ်းတိုးပါက လက်ရှိ မျှဝေစာမျက်နှာ၊ Telegram ချိတ်ဆက်မှု နှင့် အကူအညီ မှတ်တမ်းကို ဆက်ထားနိုင်ပါသည်။'
      : 'Renew to keep the same share page, Telegram linkage, and support history.',
    renewalBenefitsPremium: isMyanmar
      ? 'သက်တမ်းတိုးပါက တည်ငြိမ်သော ပရီမီယမ် လင့်ခ်၊ အလိုအလျောက် ပြန်လည်ပြောင်းရွှေ့မှု နှင့် ဦးစားပေး ဒေသ အကူအညီကို ဆက်အသုံးပြုနိုင်ပါသည်။'
      : 'Renew to keep your stable premium link, auto failover, and preferred region support.',
    orderReviewAlertTitle: isMyanmar ? '🧾 <b>Telegram order ကို စစ်ဆေးရန် လိုအပ်ပါသည်</b>' : '🧾 <b>Telegram order needs review</b>',
    orderReviewReminderTitle: isMyanmar
      ? '⏰ <b>Telegram အော်ဒါ စစ်ဆေးရန် သတိပေးချက်</b>'
      : '⏰ <b>Telegram order review reminder</b>',
    orderReviewPanelLabel: isMyanmar ? 'စီမံခန့်ခွဲမှု စာမျက်နှာတွင် စစ်ဆေးရန်' : 'Review in panel',
    orderApproveActionLabel: isMyanmar ? 'Telegram မှ အတည်ပြုရန်' : 'Approve in Telegram',
    orderRejectActionLabel: isMyanmar ? 'Telegram မှ ပယ်ရန်' : 'Reject in Telegram',
    orderRejectDuplicateActionLabel: isMyanmar ? 'ထပ်နေသော အထောက်အထား' : 'Duplicate proof',
    orderRejectBlurryActionLabel: isMyanmar ? 'မရှင်းလင်းသော အထောက်အထား' : 'Blurry proof',
    orderRejectWrongAmountActionLabel: isMyanmar ? 'ငွေပမာဏ မမှန်' : 'Wrong amount',
    orderManualReviewActionLabel: isMyanmar ? 'စီမံခန့်ခွဲမှု စာမျက်နှာတွင် စစ်ရန်' : 'Need manual review',
    orderReviewActionUnauthorized: isMyanmar ? 'ဤ action ကို admin များသာ လုပ်နိုင်ပါသည်။' : 'Only admins can perform this action.',
    orderReviewActionApproved: (code: string) =>
      isMyanmar ? `အော်ဒါ ${code} ကို Telegram မှ အတည်ပြုပြီးပါပြီ။` : `Approved order ${code} from Telegram.`,
    orderReviewActionRejected: (code: string) =>
      isMyanmar ? `အော်ဒါ ${code} ကို Telegram မှ ပယ်လိုက်ပါပြီ။` : `Rejected order ${code} from Telegram.`,
    orderReviewActionFailed: (message: string) =>
      isMyanmar ? `Telegram လုပ်ဆောင်ချက် မအောင်မြင်ပါ: ${message}` : `Telegram action failed: ${message}`,
    paymentInstructionsLabel: isMyanmar ? 'ငွေပေးချေမှု လမ်းညွှန်' : 'Payment instructions',
    paymentMethodsLabel: isMyanmar ? 'ငွေပေးချေမှု အကောင့်များ' : 'Payment methods',
    paymentMethodLabel: isMyanmar ? 'ရွေးထားသော ငွေပေးချေမှုနည်းလမ်း' : 'Payment method',
    planLabel: isMyanmar ? 'အစီအစဉ်' : 'Plan',
    priceLabel: isMyanmar ? 'စျေးနှုန်း' : 'Price',
    originalPriceLabel: isMyanmar ? 'မူရင်းစျေး' : 'Original price',
    discountLabel: isMyanmar ? 'လျှော့စျေး' : 'Discount',
    couponCodeLabel: isMyanmar ? 'ကူပွန်' : 'Coupon',
    orderCodeLabel: isMyanmar ? 'အော်ဒါ' : 'Order',
    orderTypeLabel: isMyanmar ? 'အော်ဒါ အမျိုးအစား' : 'Order type',
    orderStatusTitle: isMyanmar ? '🧾 <b>အော်ဒါ အခြေအနေ</b>' : '🧾 <b>Order status</b>',
    ordersTitle: isMyanmar ? '🧾 <b>သင့် မကြာသေးမီ အော်ဒါများ</b>' : '🧾 <b>Your recent orders</b>',
    ordersAttentionTitle: isMyanmar ? '⚡ <b>သင့် လုပ်ဆောင်ချက် လိုအပ်</b>' : '⚡ <b>Needs your action</b>',
    ordersReviewTitle: isMyanmar ? '🕐 <b>စစ်ဆေးနေဆဲ</b>' : '🕐 <b>Being reviewed</b>',
    ordersCompletedTitle: isMyanmar ? '✅ <b>ပြီးစီးပြီး</b>' : '✅ <b>Completed</b>',
    ordersEmpty: isMyanmar ? 'ℹ️ ဤ Telegram အကောင့်အတွက် အော်ဒါ မရှိသေးပါ။ /buy သို့မဟုတ် /renew ဖြင့် စတင်နိုင်ပါသည်။' : 'ℹ️ There are no orders for this Telegram account yet. Start with /buy or /renew.',
    ordersHint: isMyanmar ? 'ပိုအသေးစိတ်ကြည့်ရန် /order ORDER-CODE သို့မဟုတ် /order ကို အသုံးပြုပါ။' : 'Use /order ORDER-CODE or /order to view one order in detail.',
    ordersLatestActiveHint: isMyanmar
      ? 'သင်၏ နောက်ဆုံး အသက်ဝင် အော်ဒါကို အောက်တွင် အသေးစိတ်ပြထားပါသည်။'
      : 'Your most recent active order is shown in detail below.',
    orderStatusUsage: isMyanmar ? 'အသုံးပြုပုံ: /order သို့မဟုတ် /order ORDER-CODE' : 'Usage: /order or /order ORDER-CODE',
    orderStatusNotFound: (code: string) =>
      isMyanmar
        ? `❌ <b>${code}</b> နှင့် ကိုက်ညီသော အော်ဒါ မတွေ့ပါ။`
        : `❌ No order matched <b>${code}</b>.`,
    orderStatusLatestNotFound: isMyanmar
      ? 'ℹ️ ကြည့်ရန် အော်ဒါ မရှိသေးပါ။ /buy သို့မဟုတ် /renew ဖြင့် စတင်နိုင်ပါသည်။'
      : 'ℹ️ There is no order to show yet. Start with /buy or /renew.',
    createdAtLabel: isMyanmar ? 'စတင်ချိန်' : 'Created',
    paymentSubmittedLabel: isMyanmar ? 'အထောက်အထား ပို့ချိန်' : 'Proof submitted',
    reviewedAtLabel: isMyanmar ? 'စီမံခန့်ခွဲသူ စစ်ဆေးချိန်' : 'Reviewed',
    fulfilledAtLabel: isMyanmar ? 'ပြီးစီးချိန်' : 'Fulfilled',
    rejectedAtLabel: isMyanmar ? 'ပယ်ချိန်' : 'Rejected',
    durationLabel: isMyanmar ? 'သက်တမ်းကာလ' : 'Duration',
    preferredServerLabel: isMyanmar ? 'ရွေးထားသော ဆာဗာ' : 'Preferred server',
    deliveredKeyLabel: isMyanmar ? 'ထုတ်ပေးထားသော သော့' : 'Delivered key',
    latestOrderHint: isMyanmar ? 'နောက်ဆုံး အော်ဒါကို ပြထားပါသည်။' : 'Showing the latest order.',
    orderTimelineTitle: isMyanmar ? 'အချိန်လိုက် မှတ်တမ်း' : 'Timeline',
    orderNextStepLabel: isMyanmar ? 'နောက်တစ်ဆင့်' : 'Next step',
    orderTimelineCreated: isMyanmar ? 'အော်ဒါ စတင်' : 'Order created',
    orderTimelinePaymentStage: isMyanmar ? 'ငွေပေးချေမှု အဆင့် ဖွင့်ပြီး' : 'Payment step opened',
    orderTimelineProofSubmitted: isMyanmar ? 'အထောက်အထား ပို့ပြီး' : 'Proof submitted',
    orderTimelineReviewed: isMyanmar ? 'စီမံခန့်ခွဲသူ စစ်ပြီး' : 'Admin reviewed',
    orderTimelineFulfilled: isMyanmar ? 'အသုံးပြုခွင့် ပို့ပြီး' : 'Access delivered',
    orderTimelineRejected: isMyanmar ? 'အော်ဒါ ပယ်လိုက်သည်' : 'Order rejected',
    orderTimelineCancelled: isMyanmar ? 'အော်ဒါ ပယ်ဖျက်သည်' : 'Order cancelled',
    orderNextChooseKey: isMyanmar ? 'သက်တမ်းတိုးမည့် သော့ကို ရွေးပါ။' : 'Choose which key you want to renew.',
    orderNextChoosePlan: isMyanmar ? 'အစီအစဉ်ကို ရွေးပါ။' : 'Choose your plan.',
    orderNextChooseServer: isMyanmar ? 'အသုံးပြုလိုသော ဆာဗာကို ရွေးပါ။' : 'Choose the server you prefer.',
    orderNextChoosePaymentMethod: isMyanmar ? 'ငွေပေးချေမည့် နည်းလမ်းကို ရွေးပါ။' : 'Choose the payment method you will use.',
    orderNextUploadProof: isMyanmar ? 'ငွေပေးချေပြီး စခရင်ရှော့ကို ပို့ပါ။' : 'Complete payment and send the screenshot.',
    orderNextWaitReview: isMyanmar ? 'စီမံခန့်ခွဲသူ စစ်ဆေးမှုကို စောင့်ပါ။ အတည်ပြုပြီးနောက် အသုံးပြုခွင့်ကို ဤ chat သို့ ပို့မည်။' : 'Wait for admin review. Your access will be delivered here after approval.',
    orderNextRetry: isMyanmar ? 'အော်ဒါကို ထပ်ကြိုးစားပါ သို့မဟုတ် /buy /renew ဖြင့် ပြန်စပါ။' : 'Retry this order or start again with /buy or /renew.',
    orderNextDelivered: isMyanmar ? 'သော့ကို ဆက်အသုံးပြုရန် မျှဝေစာမျက်နှာ သို့မဟုတ် သက်တမ်းတိုး ခလုတ်ကို အသုံးပြုနိုင်ပါသည်။' : 'Use the share page or renew button to continue with this key.',
    orderKindNew: isMyanmar ? 'အသစ်' : 'New',
    orderKindRenew: isMyanmar ? 'သက်တမ်းတိုး' : 'Renewal',
    orderStatusAwaitingKeySelection: isMyanmar ? 'သော့ ရွေးချယ်ရန် စောင့်နေသည်' : 'Awaiting key selection',
    orderStatusAwaitingPlan: isMyanmar ? 'အစီအစဉ် ရွေးချယ်ရန် စောင့်နေသည်' : 'Awaiting plan selection',
    orderStatusAwaitingMonths: isMyanmar ? 'လအရေအတွက် စောင့်နေသည်' : 'Awaiting month count',
    orderStatusAwaitingServerSelection: isMyanmar ? 'ဆာဗာ ရွေးချယ်ရန် စောင့်နေသည်' : 'Awaiting server selection',
    orderStatusAwaitingKeyName: isMyanmar ? 'သော့အမည် စောင့်နေသည်' : 'Awaiting key name',
    orderStatusAwaitingPaymentMethod: isMyanmar ? 'ငွေပေးချေမှု နည်းလမ်း ရွေးရန် စောင့်နေသည်' : 'Awaiting payment method',
    orderStatusAwaitingPaymentProof: isMyanmar ? 'ငွေပေးချေမှု အထောက်အထား စောင့်နေသည်' : 'Awaiting payment proof',
    orderStatusPendingReview: isMyanmar ? 'စီမံခန့်ခွဲသူ စစ်ဆေးရန် စောင့်နေသည်' : 'Pending review',
    orderStatusApproved: isMyanmar ? 'အတည်ပြုထားပြီး ဖြစ်သည်' : 'Approved',
    orderStatusFulfilled: isMyanmar ? 'ပြီးစီးထားသည်' : 'Fulfilled',
    orderStatusRejected: isMyanmar ? 'ပယ်ထားသည်' : 'Rejected',
    orderStatusCancelled: isMyanmar ? 'ပယ်ဖျက်ထားသည်' : 'Cancelled',
    paymentProofLabel: isMyanmar ? 'ငွေပေးချေမှု အထောက်အထား' : 'Proof',
    duplicateProofWarning: (orderCode: string) =>
      isMyanmar
        ? `⚠️ ဤ စခရင်ရှော့သည် ယခင် အော်ဒါ <b>${orderCode}</b> တွင် အသုံးပြုထားသည့်ပုံစံနှင့် ကိုက်ညီနေပါသည်။`
        : `⚠️ This screenshot matches payment proof previously used on order <b>${orderCode}</b>.`,
    requestedNameLabel: isMyanmar ? 'တောင်းဆိုထားသော အမည်' : 'Requested name',
    renewalTargetLabel: isMyanmar ? 'သက်တမ်းတိုးမည့် သော့' : 'Renew target',
    accountNameLabel: isMyanmar ? 'အကောင့်အမည်' : 'Account name',
    accountNumberLabel: isMyanmar ? 'အကောင့်နံပါတ်' : 'Account number',
    customerMessage: isMyanmar ? 'အသုံးပြုသူ မက်ဆေ့ချ်' : 'Customer message',
    paymentMethodImageCaption: (label: string) =>
      isMyanmar
        ? `📷 ${label} QR / ငွေပေးချေမှု အကောင့်ပုံ`
        : `📷 ${label} QR / payment account image`,
    serverAutoSelect: isMyanmar ? 'အကောင်းဆုံး ဆာဗာကို အလိုအလျောက် ရွေးမည်' : 'Auto-select the best server',
    adminNote: isMyanmar ? 'စီမံခန့်ခွဲသူ မှတ်ချက်' : 'Admin note',
    statusNoServers: isMyanmar ? '❌ ဆာဗာ မသတ်မှတ်ရသေးပါ။' : '❌ No servers configured.',
    statusTitle: isMyanmar ? '🖥️ <b>ဆာဗာ အခြေအနေ</b>\n\n' : '🖥️ <b>Server Status</b>\n\n',
    statusLabel: isMyanmar ? 'အခြေအနေ' : 'Status',
    latencyLabel: isMyanmar ? 'တုံ့ပြန်ချိန်' : 'Latency',
    uptimeLabel: isMyanmar ? 'လည်ပတ်ချိန်' : 'Uptime',
    keysLabel: isMyanmar ? 'သော့များ' : 'Keys',
    expiringNone: (days: number) => isMyanmar ? `✅ နောက် ${days} ရက်အတွင်း သက်တမ်းကုန်မည့် သော့ မရှိပါ။` : `✅ No keys are expiring in the next ${days} day(s).`,
    expiringTitle: (days: number) => isMyanmar ? `⏳ <b>နောက် ${days} ရက်အတွင်း သက်တမ်းကုန်မည့် သော့များ</b>` : `⏳ <b>Keys expiring in the next ${days} day(s)</b>`,
    findUsage: isMyanmar ? '🔎 အသုံးပြုပုံ: /find NAME_OR_KEY_ID' : '🔎 Usage: /find NAME_OR_KEY_ID',
    findKeyFound: isMyanmar ? '🔎 <b>သော့ကို တွေ့ရှိပါသည်</b>' : '🔎 <b>Key found</b>',
    findNoMatches: (query: string) => isMyanmar ? `❌ "${query}" နှင့် ကိုက်ညီသော အသုံးပြုခွင့်သော့ မရှိပါ။` : `❌ No access keys matched "${query}".`,
    findMatches: (query: string) => isMyanmar ? `🔎 <b>"${query}" အတွက် ကိုက်ညီမှုများ</b>` : `🔎 <b>Matches for "${query}"</b>`,
    findProvideQuery: isMyanmar ? '❌ သော့ ID သို့မဟုတ် ရှာဖွေရန် စာသားတစ်ခု ထည့်ပါ။' : '❌ Please provide a key identifier or search term.',
    adminOnly: isMyanmar ? '❌ ဤ command ကို စီမံခန့်ခွဲသူများသာ အသုံးပြုနိုင်ပါသည်။' : '❌ This command is only available to administrators.',
    enableUsage: isMyanmar ? 'အသုံးပြုပုံ: /enable KEY-ID' : 'Usage: /enable KEY-ID',
    disableUsage: isMyanmar ? 'အသုံးပြုပုံ: /disable KEY-ID' : 'Usage: /disable KEY-ID',
    multiMatchUseIds: isMyanmar ? '⚠️ သော့ အများအပြား ကိုက်ညီနေပါသည်။ အောက်ပါ ID များထဲမှ တစ်ခုကို တိတိကျကျ အသုံးပြုပါ:' : '⚠️ Multiple keys matched. Use one of these exact IDs:',
    keyNotFound: isMyanmar ? '❌ သော့ မတွေ့ပါ။' : '❌ Key not found.',
    keyEnabled: (name: string) => isMyanmar ? `✅ <b>${name}</b> ကို ပြန်ဖွင့်ပြီးပါပြီ။` : `✅ Re-enabled <b>${name}</b>.`,
    keyDisabled: (name: string) => isMyanmar ? `⛔ <b>${name}</b> ကို ပိတ်လိုက်ပါပြီ။` : `⛔ Disabled <b>${name}</b>.`,
    resendUsage: isMyanmar ? 'အသုံးပြုပုံ: /resend KEY-ID' : 'Usage: /resend KEY-ID',
    resendMulti: isMyanmar ? '⚠️ သော့ အများအပြား ကိုက်ညီနေပါသည်။ တိတိကျကျ ID တစ်ခုကို အသုံးပြုပါ:' : '⚠️ Multiple keys matched. Use one exact ID:',
    resendFailed: (message: string) => isMyanmar ? `❌ ပြန်ပို့မှု မအောင်မြင်ပါ: ${message}` : `❌ Failed to resend: ${message}`,
    resendSuccess: (name: string) => isMyanmar ? `📨 <b>${name}</b> အတွက် မျှဝေစာမျက်နှာကို ပြန်ပို့ပြီးပါပြီ။` : `📨 Resent the share page for <b>${name}</b>.`,
    sysinfoGathering: isMyanmar ? '🔄 စနစ်အချက်အလက် စုဆောင်းနေပါသည်...' : '🔄 Gathering system information...',
    sysinfoTitle: isMyanmar ? '<b>စနစ်အချက်အလက်</b> 🖥️' : '<b>System Information</b> 🖥️',
    sysinfoOs: isMyanmar ? 'စနစ်' : 'OS',
    sysinfoCpu: isMyanmar ? 'CPU အသုံးပြုမှု' : 'CPU Load',
    sysinfoMemory: isMyanmar ? 'မှတ်ဉာဏ်' : 'Memory',
    sysinfoDisk: isMyanmar ? 'သိုလှောင်မှု' : 'Disk',
    sysinfoFailed: isMyanmar ? '❌ စနစ်အချက်အလက် မရယူနိုင်ပါ။' : '❌ Failed to retrieve system information.',
    backupCreating: isMyanmar ? '📦 အရန်မိတ္တူ ဖန်တီးနေပါသည်... ကျေးဇူးပြု၍ ခဏစောင့်ပါ။' : '📦 Creating backup... please wait.',
    backupCaption: (date: string) => isMyanmar ? `${date} တွင် အရန်မိတ္တူ ဖန်တီးထားပါသည်` : `Backup created at ${date}`,
    backupFailed: (message: string) => isMyanmar ? `❌ အရန်မိတ္တူ မအောင်မြင်ပါ: ${message}` : `❌ Backup failed: ${message}`,
    helpTitle: isMyanmar ? '📚 <b>အသုံးပြုနိုင်သော အမိန့်များ</b>' : '📚 <b>Available Commands</b>',
    helpEmailHint: isMyanmar ? 'ဤ Telegram အကောင့်ကို ချိတ်ရန် သင့် email ကို တိုက်ရိုက် ပို့နိုင်ပါသည်။' : 'You can also send your email address directly to link this Telegram account.',
    unknownCommand: isMyanmar ? '❓ မသိသော အမိန့်ဖြစ်သည်။ အသုံးပြုနိုင်သော အမိန့်များကို ကြည့်ရန် /help ကို အသုံးပြုပါ။' : '❓ Unknown command. Use /help to see the available commands.',
    digestTitle: isMyanmar ? '🧾 <b>Atomic-UI Telegram အနှစ်ချုပ်</b>' : '🧾 <b>Atomic-UI Telegram Digest</b>',
    digestWindow: (hours: number) => isMyanmar ? `အချိန်ကာလ: နောက်ဆုံး ${hours} နာရီ` : `Window: last ${hours} hour(s)`,
    digestActiveKeys: isMyanmar ? 'အသက်ဝင် သော့များ' : 'Active keys',
    digestPendingKeys: isMyanmar ? 'စောင့်ဆိုင်းနေသော သော့များ' : 'Pending keys',
    digestDepletedKeys: isMyanmar ? 'အသုံးကုန် သော့များ' : 'Depleted keys',
    digestExpiringSoon: isMyanmar ? '၇ ရက်အတွင်း သက်တမ်းကုန်မည်' : 'Expiring in 7 days',
    digestOpenIncidents: isMyanmar ? 'ဖွင့်ထားသော အဖြစ်အပျက်များ' : 'Open incidents',
    digestEvents: isMyanmar ? 'မျှဝေစာမျက်နှာ လှုပ်ရှားမှုများ' : 'Subscription page events',
    digestServerHealth: isMyanmar ? 'ဆာဗာ ကျန်းမာရေး' : 'Server health',
    digestHealthSummary: (up: number, slow: number, down: number, unknown: number) =>
      isMyanmar
        ? `${up} ကောင်း, ${slow} နှေး, ${down} ပိတ်, ${unknown} မသိ`
        : `${up} up, ${slow} slow, ${down} down, ${unknown} unknown`,
  };
}

export type TelegramUi = ReturnType<typeof getTelegramUi>;

export function formatExpirationSummary(key: {
  expiresAt?: Date | null;
  expirationType?: string | null;
  durationDays?: number | null;
}, locale: SupportedLocale = 'en') {
  const ui = getTelegramUi(locale);
  const localeCode = locale === 'my' ? 'my-MM' : 'en-US';
  if (!key.expiresAt) {
    if (key.expirationType === 'START_ON_FIRST_USE') {
      return ui.startsOnFirstUse(key.durationDays);
    }

    return ui.never;
  }

  const remainingMs = key.expiresAt.getTime() - Date.now();
  const daysLeft = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
  const dateText = key.expiresAt.toLocaleDateString(localeCode);

  if (daysLeft <= 0) {
    return ui.expiredOn(dateText);
  }

  return ui.daysLeft(daysLeft, dateText);
}

export function formatTelegramOrderStateLine(order: {
  orderCode: string;
  planName?: string | null;
  planCode?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  requestedName?: string | null;
}) {
  const parts = [`#${order.orderCode}`];
  if (order.planName || order.planCode) {
    parts.push(order.planName || order.planCode || '');
  }
  if (order.durationMonths) {
    parts.push(`${order.durationMonths}m`);
  }
  if (order.durationDays) {
    parts.push(`${order.durationDays}d`);
  }
  if (order.requestedName) {
    parts.push(order.requestedName);
  }
  return parts.join(' • ');
}

export function formatTelegramDateTime(value: Date | null | undefined, locale: SupportedLocale) {
  if (!value) {
    return '—';
  }

  return value.toLocaleString(locale === 'my' ? 'my-MM' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTelegramOrderStatusLabel(status: string, ui: TelegramUi) {
  switch (status) {
    case 'AWAITING_KEY_SELECTION':
      return ui.orderStatusAwaitingKeySelection;
    case 'AWAITING_PLAN':
      return ui.orderStatusAwaitingPlan;
    case 'AWAITING_MONTHS':
      return ui.orderStatusAwaitingMonths;
    case 'AWAITING_SERVER_SELECTION':
      return ui.orderStatusAwaitingServerSelection;
    case 'AWAITING_KEY_NAME':
      return ui.orderStatusAwaitingKeyName;
    case 'AWAITING_PAYMENT_METHOD':
      return ui.orderStatusAwaitingPaymentMethod;
    case 'AWAITING_PAYMENT_PROOF':
      return ui.orderStatusAwaitingPaymentProof;
    case 'PENDING_REVIEW':
      return ui.orderStatusPendingReview;
    case 'APPROVED':
      return ui.orderStatusApproved;
    case 'FULFILLED':
      return ui.orderStatusFulfilled;
    case 'REJECTED':
      return ui.orderStatusRejected;
    case 'CANCELLED':
      return ui.orderStatusCancelled;
    default:
      return status;
  }
}

export function formatTelegramRefundRequestStatusLabel(status: string, ui: TelegramUi) {
  switch (status) {
    case 'PENDING':
      return ui.refundStatusPending;
    case 'APPROVED':
      return ui.refundStatusApproved;
    case 'REJECTED':
      return ui.refundStatusRejected;
    default:
      return status;
  }
}

export function formatTelegramOrderKindLabel(kind: string, ui: TelegramUi) {
  return kind === 'RENEW' ? ui.orderKindRenew : ui.orderKindNew;
}

export function formatTelegramOrderStatusIcon(status: string) {
  switch (status) {
    case 'AWAITING_KEY_SELECTION':
    case 'AWAITING_PLAN':
    case 'AWAITING_MONTHS':
    case 'AWAITING_SERVER_SELECTION':
    case 'AWAITING_PAYMENT_METHOD':
    case 'AWAITING_PAYMENT_PROOF':
      return '🟡';
    case 'PENDING_REVIEW':
    case 'APPROVED':
      return '🟣';
    case 'FULFILLED':
      return '🟢';
    case 'REJECTED':
      return '🔴';
    case 'CANCELLED':
      return '⚪';
    default:
      return '•';
  }
}

export function formatTelegramPremiumSupportStatusLabel(status: string, ui: TelegramUi) {
  switch (status) {
    case 'PENDING_REVIEW':
      return ui.premiumStatusPendingReview;
    case 'APPROVED':
      return ui.premiumStatusApproved;
    case 'HANDLED':
      return ui.premiumStatusHandled;
    case 'DISMISSED':
      return ui.premiumStatusDismissed;
    default:
      return status;
  }
}

export function formatTelegramPremiumSupportTypeLabel(requestType: string, ui: TelegramUi) {
  return requestType === 'REGION_CHANGE'
    ? ui.premiumIssueTypeRegion
    : ui.premiumIssueTypeRoute;
}

export function normalizeTelegramOrderLookupCodes(input: string) {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) {
    return [];
  }

  return trimmed.startsWith('ORD-') ? [trimmed] : [trimmed, `ORD-${trimmed}`];
}

export function normalizeTelegramPremiumSupportLookupCodes(input: string) {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) {
    return [];
  }

  return trimmed.startsWith('PRM-') ? [trimmed] : [trimmed, `PRM-${trimmed}`];
}

export function getTelegramAccessKeyCategory(tags?: string | null) {
  return tagMatchesFilter(tags || '', 'trial') ? 'trial' : 'standard';
}

export function formatTelegramQuotaSummary(input: {
  usedBytes?: bigint | null;
  dataLimitBytes?: bigint | null;
  ui: TelegramUi;
}) {
  if (input.dataLimitBytes) {
    return `${formatBytes(input.usedBytes || BigInt(0))} / ${formatBytes(input.dataLimitBytes)}`;
  }

  return input.ui.unlimited;
}

export function formatTelegramPremiumFollowUpState(
  request: {
    status: string;
    followUpPending?: boolean | null;
    replies?: Array<{
      senderType: string;
      createdAt: Date;
      message: string;
    }>;
  },
  ui: TelegramUi,
) {
  if (request.status === 'DISMISSED') {
    return ui.premiumStatusDismissed;
  }

  if (request.status === 'PENDING_REVIEW') {
    return ui.premiumStatusPendingReview;
  }

  if (request.followUpPending) {
    return ui.premiumAwaitingAdminReply;
  }

  const lastReply = request.replies?.[request.replies.length - 1];
  if (lastReply?.senderType === 'ADMIN') {
    return ui.premiumAwaitingYourReply;
  }

  return formatTelegramPremiumSupportStatusLabel(request.status, ui);
}

export function formatTelegramReplyStateLabel(input: {
  status?: string | null;
  followUpPending?: boolean | null;
  latestReplySenderType?: string | null;
  locale: SupportedLocale;
}) {
  if ((input.status || '').toUpperCase() === 'PENDING_REVIEW' || input.followUpPending) {
    return input.locale === 'my' ? '🕒 စီမံခန့်ခွဲသူ စစ်နေ' : '🕒 Admin reviewing';
  }

  if (input.latestReplySenderType === 'ADMIN') {
    return input.locale === 'my' ? '🟡 အကြောင်းပြန်ရန် လိုအပ်' : '🟡 Reply needed';
  }

  return input.locale === 'my' ? '✅ နောက်ဆုံးအခြေအနေဖြစ်သည်' : '✅ Up to date';
}

export function buildTelegramLatestReplyPreviewLines(input: {
  reply?: {
    senderType: string;
    createdAt: Date;
    message: string;
    mediaKind?: string | null;
    mediaFilename?: string | null;
  } | null;
  locale: SupportedLocale;
  maxLength?: number;
}) {
  if (!input.reply) {
    return [];
  }

  const senderLabel =
    input.reply.senderType === 'ADMIN'
      ? input.locale === 'my'
        ? 'စီမံခန့်ခွဲသူ'
        : 'Admin'
      : input.locale === 'my'
        ? 'သင်'
        : 'You';
  const maxLength = input.maxLength ?? 120;
  const preview = input.reply.message.slice(0, maxLength);
  const lines = [
    `${input.locale === 'my' ? 'နောက်ဆုံး အကြောင်းပြန်ချက်' : 'Last reply'}: ${senderLabel} • ${formatTelegramDateTime(input.reply.createdAt, input.locale)}`,
  ];

  if (input.reply.mediaKind) {
    lines.push(
      input.reply.mediaKind === 'IMAGE'
        ? input.locale === 'my'
          ? 'တွဲဖိုင်: ပုံ'
          : 'Attachment: Image'
        : input.locale === 'my'
          ? `တွဲဖိုင်: ${input.reply.mediaFilename || 'ဖိုင်'}`
          : `Attachment: ${input.reply.mediaFilename || 'File'}`,
    );
  }

  lines.push(`${preview}${input.reply.message.length > maxLength ? '…' : ''}`);
  return lines;
}

function deriveTelegramOrderTimelineStageState(input: {
  order: {
    status: string;
    createdAt: Date;
    paymentStageEnteredAt?: Date | null;
    paymentSubmittedAt?: Date | null;
    reviewedAt?: Date | null;
    fulfilledAt?: Date | null;
    rejectedAt?: Date | null;
    expiredAt?: Date | null;
  };
}) {
  const { order } = input;
  const currentStage =
    order.status === 'AWAITING_PAYMENT_METHOD'
      ? 'payment'
      : order.status === 'AWAITING_PAYMENT_PROOF'
        ? 'proof'
        : order.status === 'PENDING_REVIEW' || order.status === 'APPROVED'
          ? 'review'
          : order.status === 'FULFILLED'
            ? 'fulfilled'
            : order.status === 'REJECTED' || order.status === 'CANCELLED'
              ? 'rejected'
              : null;

  return {
    currentStage,
    stages: [
      {
        key: 'created',
        chip: 'Created',
        label: 'Created',
        at: order.createdAt,
        state: 'done' as const,
      },
      {
        key: 'payment',
        chip: 'Method selected',
        label: 'Method selected',
        at: order.paymentStageEnteredAt,
        state: order.paymentStageEnteredAt
          ? ('done' as const)
          : currentStage === 'payment'
            ? ('current' as const)
            : ('pending' as const),
      },
      {
        key: 'proof',
        chip: 'Proof uploaded',
        label: 'Proof uploaded',
        at: order.paymentSubmittedAt,
        state: order.paymentSubmittedAt
          ? ('done' as const)
          : currentStage === 'proof'
            ? ('current' as const)
            : ('pending' as const),
      },
      {
        key: 'review',
        chip: 'Under review',
        label: 'Under review',
        at: order.reviewedAt,
        state: order.reviewedAt
          ? ('done' as const)
          : currentStage === 'review'
            ? ('current' as const)
            : ('pending' as const),
      },
    ],
    outcome:
      order.fulfilledAt
        ? {
            chip: 'Fulfilled',
            label: 'Fulfilled',
            at: order.fulfilledAt,
            state: 'done' as const,
          }
        : order.rejectedAt || order.status === 'CANCELLED'
          ? {
              chip: order.status === 'CANCELLED' ? 'Cancelled' : 'Rejected',
              label: order.status === 'CANCELLED' ? 'Cancelled' : 'Rejected',
              at:
                order.rejectedAt ||
                order.expiredAt ||
                order.reviewedAt ||
                order.paymentStageEnteredAt ||
                order.createdAt,
              state: 'done' as const,
            }
          : {
              chip: 'Fulfilled',
              label: 'Fulfilled',
              at: null,
              state: currentStage === 'fulfilled' ? ('current' as const) : ('pending' as const),
            },
  };
}

export function buildTelegramOrderTimelineChipRow(input: {
  order: {
    status: string;
    createdAt: Date;
    paymentStageEnteredAt?: Date | null;
    paymentSubmittedAt?: Date | null;
    reviewedAt?: Date | null;
    fulfilledAt?: Date | null;
    rejectedAt?: Date | null;
    expiredAt?: Date | null;
  };
  ui: TelegramUi;
}) {
  const timeline = deriveTelegramOrderTimelineStageState({ order: input.order });
  const chipLabel = (state: 'done' | 'current' | 'pending', label: string) => {
    const marker = state === 'done' ? '🟢' : state === 'current' ? '🟡' : '⚪️';
    return `${marker} <b>[${escapeHtml(label)}]</b>`;
  };

  return [
    chipLabel(timeline.stages[0]?.state ?? 'done', input.ui.orderTimelineCreated),
    chipLabel(timeline.stages[1]?.state ?? 'pending', input.ui.orderTimelinePaymentStage),
    chipLabel(timeline.stages[2]?.state ?? 'pending', input.ui.orderTimelineProofSubmitted),
    chipLabel(timeline.stages[3]?.state ?? 'pending', input.ui.orderTimelineReviewed),
    chipLabel(
      timeline.outcome.state,
      input.order.fulfilledAt
        ? input.ui.orderTimelineFulfilled
        : input.order.rejectedAt || input.order.status === 'CANCELLED'
          ? (input.order.status === 'CANCELLED' ? input.ui.orderTimelineCancelled : input.ui.orderTimelineRejected)
          : input.ui.orderTimelineFulfilled,
    ),
  ].join(' ');
}

export function buildTelegramOrderTimelineLines(input: {
  order: {
    status: string;
    createdAt: Date;
    paymentStageEnteredAt?: Date | null;
    paymentSubmittedAt?: Date | null;
    reviewedAt?: Date | null;
    fulfilledAt?: Date | null;
    rejectedAt?: Date | null;
    expiredAt?: Date | null;
  };
  locale: SupportedLocale;
  ui: TelegramUi;
}) {
  const { order, locale, ui } = input;
  const waitingLabel = locale === 'my' ? 'စောင့်နေ' : 'Waiting';
  const pendingLabel = locale === 'my' ? 'မရောက်သေး' : 'Not yet';
  const timeline = deriveTelegramOrderTimelineStageState({ order });
  const lines = [`${ui.orderTimelineTitle}:`, buildTelegramOrderTimelineChipRow({ order, ui })];
  const stages = [
    {
      label: ui.orderTimelineCreated,
      at: order.createdAt,
      state: 'done' as const,
    },
    {
      label: ui.orderTimelinePaymentStage,
      at: order.paymentStageEnteredAt,
      state: timeline.stages[1]?.state ?? ('pending' as const),
    },
    {
      label: ui.orderTimelineProofSubmitted,
      at: order.paymentSubmittedAt,
      state: timeline.stages[2]?.state ?? ('pending' as const),
    },
    {
      label: ui.orderTimelineReviewed,
      at: order.reviewedAt,
      state: timeline.stages[3]?.state ?? ('pending' as const),
    },
  ];

  for (const stage of stages) {
    const marker =
      stage.state === 'done' ? '✅' : stage.state === 'current' ? '🟡' : '⚪️';
    const detail = stage.at
      ? escapeHtml(formatTelegramDateTime(stage.at, locale))
      : stage.state === 'current'
        ? waitingLabel
        : pendingLabel;
    lines.push(`${marker} ${stage.label} · ${detail}`);
  }

  if (order.fulfilledAt) {
    lines.push(
      `✅ ${ui.orderTimelineFulfilled} · ${escapeHtml(
        formatTelegramDateTime(order.fulfilledAt, locale),
      )}`,
    );
  } else if (order.rejectedAt) {
    lines.push(
      `🛑 ${ui.orderTimelineRejected} · ${escapeHtml(
        formatTelegramDateTime(order.rejectedAt, locale),
      )}`,
    );
  } else if (order.status === 'CANCELLED') {
    lines.push(
      `🛑 ${ui.orderTimelineCancelled} · ${escapeHtml(
        formatTelegramDateTime(
          order.expiredAt || order.reviewedAt || order.paymentStageEnteredAt || order.createdAt,
          locale,
        ),
      )}`,
    );
  } else {
    lines.push(
      `⚪️ ${ui.orderTimelineFulfilled} · ${timeline.currentStage === 'fulfilled' ? waitingLabel : pendingLabel}`,
    );
  }

  return lines;
}

export function buildTelegramOrderNextStepText(
  order: {
    status: string;
  },
  ui: TelegramUi,
) {
  switch (order.status) {
    case 'AWAITING_KEY_SELECTION':
      return ui.orderNextChooseKey;
    case 'AWAITING_PLAN':
    case 'AWAITING_MONTHS':
      return ui.orderNextChoosePlan;
    case 'AWAITING_SERVER_SELECTION':
      return ui.orderNextChooseServer;
    case 'AWAITING_PAYMENT_METHOD':
      return ui.orderNextChoosePaymentMethod;
    case 'AWAITING_PAYMENT_PROOF':
      return ui.orderNextUploadProof;
    case 'PENDING_REVIEW':
    case 'APPROVED':
      return ui.orderNextWaitReview;
    case 'REJECTED':
    case 'CANCELLED':
      return ui.orderNextRetry;
    case 'FULFILLED':
      return ui.orderNextDelivered;
    default:
      return null;
  }
}

export function formatTelegramServerChoiceLabel(
  server: {
    id: string;
    name: string;
    countryCode?: string | null;
    lifecycleMode?: string | null;
  },
  ui: TelegramUi,
) {
  return server.id === 'auto'
    ? ui.serverAutoSelect
    : `${server.name}${server.countryCode ? ` ${getFlagEmoji(server.countryCode)}` : ''}${
        server.lifecycleMode === 'DRAINING' ? ` · ${ui.serverDrainingBadge}` : ''
      }`;
}

export type TelegramDynamicRoutingSource = {
  preferredCountryCodesJson?: string | null;
  preferredServerIdsJson?: string | null;
  accessKeys: Array<{
    server?: {
      countryCode?: string | null;
    } | null;
  }>;
};

export function getDynamicKeyRegionChoices(key: TelegramDynamicRoutingSource) {
  const routing = parseDynamicRoutingPreferences({
    preferredCountryCodesJson: key.preferredCountryCodesJson,
  });
  const preferred = routing.preferredCountryCodes
    .filter(Boolean)
    .map((code) => code.toUpperCase());
  const attached = Array.from(
    new Set(
      key.accessKeys
        .map((attachedKey) => attachedKey.server?.countryCode?.toUpperCase())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  return Array.from(new Set([...preferred, ...attached]));
}

export function formatTelegramDynamicPoolSummary(
  key: TelegramDynamicRoutingSource,
  ui: TelegramUi,
) {
  const routing = parseDynamicRoutingPreferences({
    preferredServerIdsJson: key.preferredServerIdsJson,
    preferredCountryCodesJson: key.preferredCountryCodesJson,
  });

  if (routing.preferredCountryCodes.length > 0) {
    return ui.premiumPreferredRegionSummary(routing.preferredCountryCodes.join(', '));
  }

  if (routing.preferredServerIds.length > 0) {
    return ui.premiumPreferredServerSummary(
      `${routing.preferredServerIds.length} preferred server${routing.preferredServerIds.length === 1 ? '' : 's'}`,
    );
  }

  const attachedRegions = getDynamicKeyRegionChoices(key);
  if (attachedRegions.length > 0) {
    return ui.premiumPreferredRegionSummary(attachedRegions.join(', '));
  }

  return ui.coverageAutoSelected;
}
