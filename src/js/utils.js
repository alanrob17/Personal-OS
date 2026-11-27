export function generateId() {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

export function roundClean(num) {
  return Math.round(num * 10000) / 10000;
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);
}

export function formatNumber(num) {
  return new Intl.NumberFormat('en-AU', {
    maximumFractionDigits: 2
  }).format(roundClean(Number(num) || 0));
}

export function getTodayDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

export function parseLocalDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const parts = dateStr.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) {
    return null;
  }
  return date;
}

export function isValidDateString(str) {
  return parseLocalDate(str) !== null;
}

// DST-safe whole-day difference between two local midnight dates
export function diffDays(fromDate, toDate) {
  const utc1 = Date.UTC(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const utc2 = Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.round((utc2 - utc1) / 86400000);
}

export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// Anchored month arithmetic: clamps day to last day of target month without drifting
export function addMonthsAnchored(startYear, startMonth, startDay, monthsToAdd) {
  const totalMonths = startMonth + monthsToAdd;
  const targetYear = startYear + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(startDay, lastDay));
}

export function formatDisplayDate(dateStr, includeYear) {
  const d = typeof dateStr === 'string' ? parseLocalDate(dateStr) : dateStr;
  if (!d) return '';
  const today = getTodayDate();
  const showYear = includeYear !== undefined ? includeYear : d.getFullYear() !== today.getFullYear();
  return d.toLocaleDateString('en-AU', showYear
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' }
  );
}

export function formatRelativeDays(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1) return 'In ' + days + ' days';
  return Math.abs(days) + ' days ago';
}

export function getDueDateInfo(dueDateStr, isDone) {
  if (!dueDateStr) return null;
  const due = parseLocalDate(dueDateStr);
  if (!due) return null;
  const today = getTodayDate();
  const delta = diffDays(today, due);
  const shortDate = formatDisplayDate(due);

  if (isDone) {
    return {
      state: 'done',
      delta: delta,
      label: shortDate,
      badgeClass: 'badge-neutral'
    };
  }
  if (delta < 0) {
    return {
      state: 'overdue',
      delta: delta,
      label: 'Overdue · ' + shortDate,
      badgeClass: 'badge-overdue'
    };
  }
  if (delta === 0) {
    return {
      state: 'today',
      delta: 0,
      label: 'Due today',
      badgeClass: 'badge-today'
    };
  }
  return {
    state: 'upcoming',
    delta: delta,
    label: 'Upcoming · ' + shortDate,
    badgeClass: 'badge-upcoming'
  };
}

/**
 * Automatically computes next renewal date and status from startDate, frequency, and optional endDate.
 */
export function calculateSubscriptionRenewal(sub) {
  const today = getTodayDate();
  const start = parseLocalDate(sub.startDate);
  const end = sub.endDate ? parseLocalDate(sub.endDate) : null;

  if (!start) {
    return { status: 'ended', active: false, nextRenewal: null, daysUntil: null, renewingSoon: false };
  }

  if (end && diffDays(today, end) < 0) {
    return { status: 'ended', active: false, nextRenewal: null, daysUntil: null, renewingSoon: false, endDate: end };
  }

  let candidate;
  if (diffDays(today, start) >= 0) {
    candidate = start;
  } else {
    const sy = start.getFullYear();
    const sm = start.getMonth();
    const sd = start.getDate();

    if (sub.frequency === 'Weekly') {
      const elapsed = diffDays(start, today);
      let k = Math.max(0, Math.floor(elapsed / 7));
      candidate = addDays(start, k * 7);
      while (diffDays(today, candidate) < 0) {
        k++;
        candidate = addDays(start, k * 7);
      }
    } else {
      const stepMonths = sub.frequency === 'Monthly' ? 1 : (sub.frequency === 'Quarterly' ? 3 : 12);
      const monthDiff = (today.getFullYear() - sy) * 12 + (today.getMonth() - sm);
      let k = Math.max(0, Math.floor(monthDiff / stepMonths) - 1);
      candidate = addMonthsAnchored(sy, sm, sd, k * stepMonths);
      while (diffDays(today, candidate) < 0) {
        k++;
        candidate = addMonthsAnchored(sy, sm, sd, k * stepMonths);
      }
    }
  }

  // If the next calculated renewal falls past the endDate, the subscription is active but won't renew again
  if (end && diffDays(end, candidate) > 0) {
    return {
      status: 'ending',
      active: true,
      nextRenewal: null,
      daysUntil: null,
      daysUntilEnd: diffDays(today, end),
      renewingSoon: false,
      endDate: end
    };
  }

  const daysUntil = diffDays(today, candidate);
  return {
    status: 'active',
    active: true,
    nextRenewal: candidate,
    nextRenewalISO: formatDateISO(candidate),
    daysUntil: daysUntil,
    renewingSoon: daysUntil >= 0 && daysUntil <= 30,
    endDate: end
  };
}

export function normalizeMonthlyCost(cost, frequency) {
  const c = Number(cost) || 0;
  switch (frequency) {
    case 'Weekly': return (c * 52) / 12;
    case 'Monthly': return c;
    case 'Quarterly': return c / 3;
    case 'Yearly': return c / 12;
    default: return c;
  }
}

export function getTotalMonthlySubscriptionCost(subscriptions) {
  return (subscriptions || []).reduce(function (sum, sub) {
    const info = calculateSubscriptionRenewal(sub);
    return info.active ? sum + normalizeMonthlyCost(sub.cost, sub.frequency) : sum;
  }, 0);
}

export function getGoalSmartStep(target) {
  if (target >= 1000) return 100;
  if (target >= 100) return 10;
  if (target >= 25) return 5;
  return null;
}

export function highlightMatch(rawText, query) {
  const text = String(rawText || '');
  if (!query) return escapeHtml(text);
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return escapeHtml(text);
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return escapeHtml(before) + '<mark class="search-mark">' + escapeHtml(match) + '</mark>' + escapeHtml(after);
}

export function isPlainObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}
