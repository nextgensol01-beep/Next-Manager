/** Conservative safeguards for personalised tracker campaigns. */
export const TRACKER_EMAIL_SAFETY = {
  maxSendsPer24Hours: 350,
  // Messages are delivered serially; this is a gentle pause, not a batch limit.
  delayBetweenDeliveriesMs: 350,
} as const;
