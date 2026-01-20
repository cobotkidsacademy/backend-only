/**
 * Timezone utility for handling Africa/Nairobi timezone
 * Kenya uses East Africa Time (EAT) which is UTC+3
 */

const NAIROBI_TIMEZONE = 'Africa/Nairobi';

/**
 * Get current date/time - returns a Date object
 * Note: Date objects are always in UTC internally, but we'll format them for Nairobi
 */
export function getNairobiTime(): Date {
  return new Date();
}

/**
 * Get day of week in Nairobi timezone
 */
export function getNairobiDayOfWeek(date: Date = new Date()): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  // Get the day of week as it appears in Nairobi timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: NAIROBI_TIMEZONE,
    weekday: 'long',
  });
  
  const dayName = formatter.format(date).toLowerCase();
  return dayName;
}

/**
 * Format date to Nairobi timezone string
 */
export function formatNairobiTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString('en-US', {
    timeZone: NAIROBI_TIMEZONE,
    ...options,
  });
}

/**
 * Get date components in Nairobi timezone
 */
export function getNairobiDateComponents(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: NAIROBI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => {
    const part = parts.find(p => p.type === type);
    return part ? parseInt(part.value, 10) : 0;
  };

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hours: getPart('hour'),
    minutes: getPart('minute'),
    seconds: getPart('second'),
  };
}

/**
 * Create a date with specific time in Nairobi timezone
 * This creates a Date object that represents the given time in Nairobi
 * @param baseDate Base date (will use its date components in Nairobi timezone)
 * @param hours Hours (0-23) in Nairobi time
 * @param minutes Minutes (0-59) in Nairobi time
 * @param addDays Days to add (default 0)
 */
export function createNairobiDateTime(
  baseDate: Date,
  hours: number,
  minutes: number,
  addDays: number = 0
): Date {
  // Get the date components in Nairobi timezone
  const components = getNairobiDateComponents(baseDate);
  
  const year = components.year;
  const month = components.month;
  let day = components.day + addDays;
  
  // Nairobi is UTC+3, so if we want 14:00 Nairobi time, we create 11:00 UTC
  // Convert Nairobi time to UTC by subtracting 3 hours
  let utcHours = hours - 3;
  
  // Handle hour overflow/underflow which affects the day
  if (utcHours < 0) {
    day -= 1;
    utcHours = 24 + utcHours;
  } else if (utcHours >= 24) {
    day += 1;
    utcHours = utcHours - 24;
  }
  
  // Create UTC date that represents the Nairobi time
  return new Date(Date.UTC(year, month - 1, day, utcHours, minutes, 0));
}
