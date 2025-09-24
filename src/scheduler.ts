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
    // Use middle-of-day scheduling: prefer 10 AM to 4 PM
    const preferredStart = Math.max(10, this.config.workingHours.startHour);
    const preferredEnd = Math.min(16, this.config.workingHours.endHour);

    const dayStart = date
      .hour(this.config.workingHours.startHour)
      .minute(0)
      .second(0);

    const dayEnd = date
      .hour(this.config.workingHours.endHour)
      .minute(0)
      .second(0);

    const preferredDayStart = date
      .hour(preferredStart)
      .minute(0)
      .second(0);

    const preferredDayEnd = date
      .hour(preferredEnd)
      .minute(0)
      .second(0);

    // Get events for this day and sort by start time
    const dayEvents = this.getEventsForDate(date, existingEvents)
      .sort((a, b) =>
        dayjs(a.start.dateTime).valueOf() - dayjs(b.start.dateTime).valueOf()
      );

    // Try to find a slot in preferred hours first (10 AM - 4 PM)
    if (dayEvents.length === 0) {
      // No events, use preferred start time
      return {
        startTime: preferredDayStart.toISOString(),
        endTime: preferredDayStart.add(durationMin, "minutes").toISOString(),
      };
    }

    // First, try to find slots within preferred hours
    const preferredSlot = this.findSlotInTimeRange(
      preferredDayStart,
      preferredDayEnd,
      durationMin,
      dayEvents,
    );
    if (preferredSlot) {
      return preferredSlot;
    }

    // If no preferred slot found, try full working day with better spacing
    const fullDaySlot = this.findSlotInTimeRange(
      dayStart,
      dayEnd,
      durationMin,
      dayEvents,
    );

    return fullDaySlot;
  }

  /**
   * Find an available slot within a specific time range
   */
  private findSlotInTimeRange(
    rangeStart: dayjs.Dayjs,
    rangeEnd: dayjs.Dayjs,
    durationMin: number,
    dayEvents: GCalEvent[],
  ): TimeSlot | null {
    // Add 15-minute buffer between events to prevent tight scheduling
    const BUFFER_MINUTES = 15;
    const totalDurationNeeded = durationMin + BUFFER_MINUTES;

    // Filter events that overlap with our time range
    const relevantEvents = dayEvents.filter((event) => {
      const eventStart = dayjs(event.start.dateTime);
      const eventEnd = dayjs(event.end.dateTime);
      return eventStart.isBefore(rangeEnd) && eventEnd.isAfter(rangeStart);
    });

    if (relevantEvents.length === 0) {
      // No events in range, use range start
      const endTime = rangeStart.add(durationMin, "minutes");
      if (endTime.isAfter(rangeEnd)) {
        return null; // Doesn't fit in range
      }
      return {
        startTime: rangeStart.toISOString(),
        endTime: endTime.toISOString(),
      };
    }

    // Try before first event
    const firstEventStart = dayjs(relevantEvents[0].start.dateTime);
    const spaceBeforeFirst = firstEventStart.diff(rangeStart, "minutes");
    if (spaceBeforeFirst >= totalDurationNeeded) {
      return {
        startTime: rangeStart.toISOString(),
        endTime: rangeStart.add(durationMin, "minutes").toISOString(),
      };
    }

    // Try gaps between events
    for (let i = 0; i < relevantEvents.length - 1; i++) {
      const currentEventEnd = dayjs(relevantEvents[i].end.dateTime);
      const nextEventStart = dayjs(relevantEvents[i + 1].start.dateTime);

      const potentialStart = currentEventEnd.add(BUFFER_MINUTES, "minutes");
      const potentialEnd = potentialStart.add(durationMin, "minutes");

      if (
        potentialEnd.add(BUFFER_MINUTES, "minutes").isBefore(nextEventStart)
      ) {
        return {
          startTime: potentialStart.toISOString(),
          endTime: potentialEnd.toISOString(),
        };
      }
    }

    // Try after last event
    const lastEventEnd = dayjs(
      relevantEvents[relevantEvents.length - 1].end.dateTime,
    );
    const potentialStart = lastEventEnd.add(BUFFER_MINUTES, "minutes");
    const potentialEnd = potentialStart.add(durationMin, "minutes");

    if (potentialEnd.isBefore(rangeEnd)) {
      return {
        startTime: potentialStart.toISOString(),
        endTime: potentialEnd.toISOString(),
      };
    }

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

    // Use middle-of-day scheduling: prefer 10 AM to 4 PM
    const preferredStart = Math.max(10, this.config.workingHours.startHour);

    // Tomorrow at preferred time (default 10 AM) in configured timezone
    const startTime = dayjs()
      .tz(this.config.timezone)
      .add(1, "day")
      .hour(preferredStart)
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
