"use client";

import React from "react";
import { Activity } from "lucide-react";
import { formatDate } from "@/lib/utils";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  ACTIVITY_FILTERS,
  ACTIVITY_RANGES,
  activityColors,
  activityIcon,
  CollapsibleSectionHeader,
  FilterRail,
  type ActivityFilter,
  type ActivityItem,
  type ActivityRange,
} from "./ClientProfileSupport";

type ClientProfileActivityTimelineProps = {
  selectedFy: string;
  open: boolean;
  onToggle: () => void;
  activityWindowHelpText: string;
  activityEmptyText: string;
  activitiesTotal: number;
  activityRange: ActivityRange;
  setActivityRange: (range: ActivityRange) => void;
  activityFilter: ActivityFilter;
  setActivityFilter: (filter: ActivityFilter) => void;
  activityError: string | null;
  activityLoading: boolean;
  activityLoadingMore: boolean;
  activityHasMore: boolean;
  filteredActivities: ActivityItem[];
  listRef: React.RefObject<HTMLDivElement | null>;
  handleActivityScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  getActivityFyChip: (activity: ActivityItem) => { label: string; className: string };
  getActivityActionLabel: (activity: ActivityItem) => string | null;
  handleActivityAction: (activity: ActivityItem) => void;
};

export default function ClientProfileActivityTimeline({
  selectedFy,
  open,
  onToggle,
  activityWindowHelpText,
  activityEmptyText,
  activitiesTotal,
  activityRange,
  setActivityRange,
  activityFilter,
  setActivityFilter,
  activityError,
  activityLoading,
  activityLoadingMore,
  activityHasMore,
  filteredActivities,
  listRef,
  handleActivityScroll,
  getActivityFyChip,
  getActivityActionLabel,
  handleActivityAction,
}: ClientProfileActivityTimelineProps) {
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-base overflow-hidden">
      <div className="px-5 py-4 border-b border-base space-y-3">
        <CollapsibleSectionHeader
          title="Recent Activity"
          subtitle={`${activityWindowHelpText} FY-tagged events are highlighted and global events stay neutral.`}
          open={open}
          onToggle={onToggle}
          trailing={<span className="text-xs bg-surface text-muted px-2 py-0.5 rounded-full">{activitiesTotal.toLocaleString("en-IN")} events</span>}
        />
        {open && (
          <div className="space-y-3">
            <FilterRail
              label="Window"
              value={activityRange}
              options={ACTIVITY_RANGES}
              onChange={setActivityRange}
              tone="neutral"
            />
            <FilterRail
              label="Type"
              value={activityFilter}
              options={ACTIVITY_FILTERS}
              onChange={setActivityFilter}
              tone="brand"
            />
          </div>
        )}
      </div>

      {open && (
        <>
          {activityError ? (
            <div className="px-5 py-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                {activityError}
              </div>
            </div>
          ) : activityLoading ? (
            <div className="py-10 flex items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Activity className="w-4 h-4 text-brand-600 mx-auto" />
              <p className="font-semibold text-default mt-3 mb-1">No activity for this filter</p>
              <p className="text-sm text-muted">{activityEmptyText}.</p>
            </div>
          ) : (
            <div ref={listRef} onScroll={handleActivityScroll} className="max-h-[440px] overflow-y-auto">
              <div className="divide-y divide-soft">
                {filteredActivities.map((event) => (
                  <div
                    key={event.id}
                    className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${
                      event.financialYear === selectedFy
                        ? "bg-brand-50/35 dark:bg-brand-900/10"
                        : "hover:bg-surface bg-surface/40"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${activityColors[event.color] || "bg-surface text-muted"}`}>{activityIcon(event.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-default leading-snug truncate">{event.label}</p>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${getActivityFyChip(event).className}`}>{getActivityFyChip(event).label}</span>
                          {event.badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${event.badgeColor || "bg-surface text-muted"}`}>{event.badge}</span>}
                        </div>
                      </div>
                      <p className="text-xs text-muted mt-0.5 truncate">{event.detail}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-faint">{formatDate(event.date)}</p>
                        {getActivityActionLabel(event) && (
                          <button type="button" onClick={() => handleActivityAction(event)} className="text-[11px] font-medium text-brand-600 hover:text-brand-700">
                            {getActivityActionLabel(event)}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {activityLoadingMore && (
                  <div className="py-3 flex items-center justify-center">
                    <LoadingSpinner />
                  </div>
                )}
                {!activityLoadingMore && !activityHasMore && filteredActivities.length > 0 && (
                  <div className="px-5 py-3 text-center">
                    <span className="text-xs text-muted">You&apos;ve reached the end of this activity list.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
