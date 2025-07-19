/**
 * Smart Scheduler: Finds optimal time slots for new events
 * Considers working hours, existing events, and avoids conflicts
 */

import {
  estimateToDuration,
  GCalEvent,
  LinearEstimate,
  SyncConfig,
} from "./types.ts";
import dayjs from "npm:dayjs@1.11.10";
import timezone from "npm:dayjs@1.11.10/plugin/timezone.js";
import utc from "npm:dayjs@1.11.10/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface TimeSlot {
  startTime: string; // ISO datetime
  endTime: string; // ISO datetime
}

export interface SchedulingRequest {
  estimate: LinearEstimate;
  preferredDate?: string; // ISO date, if user has preference
  title: string; // For logging/debugging
}

export class SmartScheduler {
  constructor(private config: SyncConfig) {}

  /**
   * Find the next available time slot for a new event
   */
  findNextAvailableSlot(
    request: SchedulingRequest,
    existingEvents: GCalEvent[],
  ): TimeSlot {
    const durationMin = estimateToDuration(request.estimate);

    // Start searching from preferred date (if in future) or tomorrow
    const now = dayjs().tz(this.config.timezone);
    const tomorrow = now.add(1, "day");

    const startSearchDate = request.preferredDate
      ? dayjs(request.preferredDate).tz(this.config.timezone).isAfter(now)
        ? dayjs(request.preferredDate).tz(this.config.timezone)
        : tomorrow // Use tomorrow if preferred date is in the past
      : tomorrow;

    // Search up to 14 days ahead
    const maxSearchDate = startSearchDate.add(14, "days");

    let currentDate = startSearchDate.startOf("day");

    while (currentDate.isBefore(maxSearchDate)) {
      // Skip weekends if not in working days
      if (!this.config.workingHours.workingDays.includes(currentDate.day())) {
        currentDate = currentDate.add(1, "day");
        continue;
      }

      const slot = this.findSlotOnDate(
        currentDate,
        durationMin,
        existingEvents,
      );
      if (slot) {
        console.log(`📅 Scheduled "${request.title}" for ${slot.startTime}`);
        return slot;
      }

      currentDate = currentDate.add(1, "day");
    }

    // Fallback: schedule anyway at end of search period
    const fallbackStart = maxSearchDate
      .hour(this.config.workingHours.startHour)
      .minute(0)
      .second(0);

    console.warn(
      `⚠️  No available slots found for "${request.title}", using fallback`,
    );

    return {
      startTime: fallbackStart.toISOString(),
      endTime: fallbackStart.add(durationMin, "minutes").toISOString(),
    };
  }

  /**
   * Find an available slot on a specific date
   */
  private findSlotOnDate(
    date: dayjs.Dayjs,
    durationMin: number,
    existingEvents: GCalEvent[],
  ): TimeSlot | null {
    const dayStart = date
      .hour(this.config.workingHours.startHour)
      .minute(0)
      .second(0);

    const dayEnd = date
      .hour(this.config.workingHours.endHour)
      .minute(0)
      .second(0);

    // Get events for this day and sort by start time
    const dayEvents = this.getEventsForDate(date, existingEvents)
      .sort((a, b) =>
        dayjs(a.start.dateTime).valueOf() - dayjs(b.start.dateTime).valueOf()
      );

    // Try to find a slot before the first event
    if (dayEvents.length === 0) {
      // No events, use start of day
      return {
        startTime: dayStart.toISOString(),
        endTime: dayStart.add(durationMin, "minutes").toISOString(),
      };
    }

    const firstEventStart = dayjs(dayEvents[0].start.dateTime);
    if (firstEventStart.diff(dayStart, "minutes") >= durationMin) {
      // Fits before first event
      return {
        startTime: dayStart.toISOString(),
        endTime: dayStart.add(durationMin, "minutes").toISOString(),
      };
    }

    // Try to find gaps between events
    for (let i = 0; i < dayEvents.length - 1; i++) {
      const currentEventEnd = dayjs(dayEvents[i].end.dateTime);
      const nextEventStart = dayjs(dayEvents[i + 1].start.dateTime);

      const gapMinutes = nextEventStart.diff(currentEventEnd, "minutes");
      if (gapMinutes >= durationMin) {
        // Found a gap that fits
        return {
          startTime: currentEventEnd.toISOString(),
          endTime: currentEventEnd.add(durationMin, "minutes").toISOString(),
        };
      }
    }

    // Try after the last event
    const lastEventEnd = dayjs(dayEvents[dayEvents.length - 1].end.dateTime);
    const remainingMinutes = dayEnd.diff(lastEventEnd, "minutes");

    if (remainingMinutes >= durationMin) {
      return {
        startTime: lastEventEnd.toISOString(),
        endTime: lastEventEnd.add(durationMin, "minutes").toISOString(),
      };
    }

    // No slot found on this day
    return null;
  }

  /**
   * Get all events that occur on a specific date
   */
  private getEventsForDate(
    date: dayjs.Dayjs,
    events: GCalEvent[],
  ): GCalEvent[] {
    const dateStr = date.format("YYYY-MM-DD");

    return events.filter((event) => {
      const eventStart = dayjs(event.start.dateTime);
      const eventEnd = dayjs(event.end.dateTime);

      // Event overlaps with this date
      return eventStart.format("YYYY-MM-DD") === dateStr ||
        eventEnd.format("YYYY-MM-DD") === dateStr ||
        (eventStart.isBefore(date.startOf("day")) &&
          eventEnd.isAfter(date.endOf("day")));
    });
  }

  /**
   * Generate default time slot for immediate scheduling
   * Used as fallback when smart scheduling isn't needed
   */
  getDefaultTimeSlot(estimate: LinearEstimate = "S"): TimeSlot {
    const durationMin = estimateToDuration(estimate);

    // Tomorrow at 9 AM in configured timezone
    const startTime = dayjs()
      .tz(this.config.timezone)
      .add(1, "day")
      .hour(this.config.workingHours.startHour)
      .minute(0)
      .second(0);

    return {
      startTime: startTime.toISOString(),
      endTime: startTime.add(durationMin, "minutes").toISOString(),
    };
  }

  /**
   * Check if a time slot conflicts with existing events
   */
  hasConflict(slot: TimeSlot, existingEvents: GCalEvent[]): boolean {
    const slotStart = dayjs(slot.startTime);
    const slotEnd = dayjs(slot.endTime);

    return existingEvents.some((event) => {
      const eventStart = dayjs(event.start.dateTime);
      const eventEnd = dayjs(event.end.dateTime);

      // Check for overlap
      return slotStart.isBefore(eventEnd) && slotEnd.isAfter(eventStart);
    });
  }
}
