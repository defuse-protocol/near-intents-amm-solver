export const quoteDeadlineMaxMs = 1 * 60 * 1000; // 1 min
export const quoteDeadlineExtraMs = 10 * 1000; // 10 seconds (extra time to add to the requested deadline)

export const marginPercent = process.env.MARGIN_PERCENT ? Number(process.env.MARGIN_PERCENT) : 0.3;
