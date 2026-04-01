export type RefundReviewAction = 'APPROVE' | 'REJECT';

export type RefundReasonPreset = {
  code: string;
  action: RefundReviewAction;
  label: string;
  adminNote: string;
  customerMessage: string;
};

export const REFUND_REASON_PRESETS: RefundReasonPreset[] = [
  {
    code: 'approved_policy_eligible',
    action: 'APPROVE',
    label: 'Approved: eligible under policy',
    adminNote: 'Approved under the current refund policy.',
    customerMessage: 'Your refund request was approved under the current policy. The refund has been recorded.',
  },
  {
    code: 'approved_manual_exception',
    action: 'APPROVE',
    label: 'Approved: manual exception',
    adminNote: 'Approved as a manual finance exception.',
    customerMessage: 'Your refund request was approved as a manual exception. Please contact admin if you need more details.',
  },
  {
    code: 'reject_usage_over_5gb',
    action: 'REJECT',
    label: 'Rejected: usage above 5 GB',
    adminNote: 'Rejected because usage is above the 5 GB refund limit.',
    customerMessage: 'This refund request could not be approved because the key usage already exceeded 5 GB.',
  },
  {
    code: 'reject_purchase_count',
    action: 'REJECT',
    label: 'Rejected: fewer than 4 paid purchases',
    adminNote: 'Rejected because the customer has not completed more than 3 paid purchases yet.',
    customerMessage: 'This refund request could not be approved because refunds unlock only after more than 3 paid purchases.',
  },
  {
    code: 'reject_already_refunded',
    action: 'REJECT',
    label: 'Rejected: already refunded',
    adminNote: 'Rejected because this order was already refunded.',
    customerMessage: 'This order already has a refund recorded, so the request could not be approved again.',
  },
  {
    code: 'reject_payment_verification',
    action: 'REJECT',
    label: 'Rejected: payment verification issue',
    adminNote: 'Rejected because the payment details could not be verified.',
    customerMessage: 'This refund request could not be approved because the payment details still need verification. Please contact admin for help.',
  },
  {
    code: 'reject_manual_review',
    action: 'REJECT',
    label: 'Rejected: contact admin',
    adminNote: 'Rejected after manual review. Customer should contact admin.',
    customerMessage: 'This refund request could not be approved automatically. Please contact admin/support for more information.',
  },
];

export function getRefundReasonPreset(code?: string | null) {
  if (!code) {
    return null;
  }

  return REFUND_REASON_PRESETS.find((preset) => preset.code === code) || null;
}

export function listRefundReasonPresets(action?: RefundReviewAction) {
  if (!action) {
    return REFUND_REASON_PRESETS;
  }

  return REFUND_REASON_PRESETS.filter((preset) => preset.action === action);
}

export function resolveRefundReasonPresetLabel(code?: string | null) {
  return getRefundReasonPreset(code)?.label || null;
}
