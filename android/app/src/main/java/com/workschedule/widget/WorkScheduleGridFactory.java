package com.workschedule.widget;

import android.util.Log;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.text.SimpleDateFormat;

public class WorkScheduleGridFactory implements RemoteViewsService.RemoteViewsFactory {
    private static final String TAG = "WorkScheduleGrid";
    private static final int TOTAL_CELLS = 42;

    private final Context context;
    private final int appWidgetId;
    private final List<CellData> cells = new ArrayList<>();

    public WorkScheduleGridFactory(Context context, Intent intent) {
        this.context = context;
        this.appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
    }

    @Override
    public void onCreate() {
        onDataSetChanged();
    }

    @Override
    public void onDataSetChanged() {
        Log.d(TAG, "onDataSetChanged 호출됨 — widgetId=" + appWidgetId);
        SharedPreferences prefs = context.getSharedPreferences(WorkScheduleWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);
        int offset = prefs.getInt("monthOffset", 0);
        String raw;
        if (offset == -1) {
            raw = prefs.getString("prevMonthCellsJson", "[]");
        } else if (offset == 1) {
            raw = prefs.getString("nextMonthCellsJson", "[]");
        } else {
            raw = prefs.getString("monthCellsJson", "[]");
        }
        String todayDate = new SimpleDateFormat("yyyy-MM-dd", Locale.KOREA).format(new Date());
        String selectedDate = prefs.getString("selectedDate", "");

        Log.d(TAG, "offset=" + offset + " cellsJson 길이=" + raw.length());
        cells.clear();
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length() && i < TOTAL_CELLS; i++) {
                JSONObject item = array.optJSONObject(i);
                if (item == null) {
                    cells.add(CellData.empty());
                    continue;
                }

                CellData data = new CellData();
                data.inMonth = item.optBoolean("inMonth", false);
                data.isPeriod = item.optBoolean("isPeriod", false);
                data.isHoliday = item.optBoolean("isHoliday", false);
                data.isCalendarNote = item.optBoolean("isCalendarNote", false);
                data.noteCount = item.optInt("noteCount", 0);
                data.dayText = item.optString("dayText", "");
                data.shiftText = item.optString("shiftText", "");
                data.noteText = item.optString("noteText", "");
                data.dayColor = item.optString("dayColor", "#1E293B");
                data.shiftColor = item.optString("shiftColor", "#334155");
                data.noteColor = item.optString("noteColor", "#64748B");
                data.dateStr = item.optString("dateStr", "");
                data.isToday = data.inMonth && todayDate.equals(data.dateStr);
                data.isSelected = data.inMonth && !data.isToday && selectedDate.equals(data.dateStr);
                cells.add(data);
            }
        } catch (Exception ignored) {
            // Keep fallback empty cells.
        }

        while (cells.size() < TOTAL_CELLS) {
            cells.add(CellData.empty());
        }
    }

    @Override
    public void onDestroy() {
        cells.clear();
    }

    @Override
    public int getCount() {
        return cells.size();
    }

    @Override
    public RemoteViews getViewAt(int position) {
        if (position < 0 || position >= cells.size()) return null;

        CellData cell = cells.get(position);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.work_schedule_widget_day_item);
        int row = position / 7;
        int col = position % 7;
        boolean isBottomRow = row == (TOTAL_CELLS / 7) - 1;
        boolean isLeft = col == 0;
        boolean isRight = col == 6;

        views.setViewVisibility(R.id.widget_border_top, android.view.View.VISIBLE);
        views.setViewVisibility(R.id.widget_border_bottom, isBottomRow ? android.view.View.VISIBLE : android.view.View.GONE);
        views.setViewVisibility(R.id.widget_border_left, isLeft ? android.view.View.VISIBLE : android.view.View.GONE);
        views.setViewVisibility(R.id.widget_border_right, isRight ? android.view.View.VISIBLE : android.view.View.GONE);

        int contentBackgroundRes;
        if (cell.isToday) {
            contentBackgroundRes = R.drawable.widget_cell_today;
        } else if (cell.isSelected) {
            contentBackgroundRes = R.drawable.widget_cell_selected;
        } else if (cell.isPeriod) {
            contentBackgroundRes = R.drawable.widget_cell_period;
        } else {
            contentBackgroundRes = R.drawable.widget_cell_normal;
        }
        views.setInt(
                R.id.widget_day_item_content,
                "setBackgroundResource",
                contentBackgroundRes
        );

        if (!cell.inMonth) {
            views.setTextViewText(R.id.widget_day_text, cell.dayText);
            views.setTextViewText(R.id.widget_shift_text, "");
            views.setTextViewText(R.id.widget_note_text, "");
            views.setTextColor(R.id.widget_day_text, parseColorOrDefault(cell.dayColor, "#CBD5E1"));
            views.setViewVisibility(R.id.widget_shift_text, android.view.View.INVISIBLE);
            views.setViewVisibility(R.id.widget_note_text, android.view.View.INVISIBLE);
        } else {
            views.setTextViewText(R.id.widget_day_text, cell.dayText);
            views.setTextViewText(R.id.widget_shift_text, cell.shiftText);
            views.setTextViewText(R.id.widget_note_text, cell.noteText);
            views.setViewVisibility(R.id.widget_shift_text, android.view.View.VISIBLE);
            views.setTextColor(R.id.widget_day_text, parseColorOrDefault(cell.dayColor, "#1E293B"));

            boolean hasNote = cell.noteText != null && !cell.noteText.trim().isEmpty();
            if (hasNote) {
                views.setViewVisibility(R.id.widget_note_text, android.view.View.VISIBLE);
                if (cell.isHoliday) {
                    views.setInt(R.id.widget_note_text, "setBackgroundResource", R.drawable.widget_cell_note_holiday_bg);
                    views.setTextColor(R.id.widget_note_text, Color.parseColor("#9F1239"));
                } else if (cell.isCalendarNote) {
                    views.setInt(R.id.widget_note_text, "setBackgroundResource", R.drawable.widget_note_card_calendar_bg);
                    views.setTextColor(R.id.widget_note_text, Color.parseColor("#0E7490"));
                } else {
                    views.setInt(R.id.widget_note_text, "setBackgroundResource", R.drawable.widget_cell_note_normal_bg);
                    views.setTextColor(R.id.widget_note_text, Color.parseColor("#3730A3"));
                }
                // 첫 번째 노트 외에 추가 노트가 있으면 +N 표시
                int extraCount = cell.noteCount - 1;
                if (extraCount > 0) {
                    views.setViewVisibility(R.id.widget_note_more, android.view.View.VISIBLE);
                    views.setTextViewText(R.id.widget_note_more, "+" + extraCount);
                } else {
                    views.setViewVisibility(R.id.widget_note_more, android.view.View.GONE);
                }
            } else {
                views.setViewVisibility(R.id.widget_note_text, android.view.View.GONE);
                views.setViewVisibility(R.id.widget_note_more, android.view.View.GONE);
            }

            boolean hasShift = cell.shiftText != null && !cell.shiftText.trim().isEmpty();

            if (hasShift) {
                // Apply card style to the shift TextView
                views.setInt(R.id.widget_shift_text, "setBackgroundColor", parseColorOrDefault(cell.shiftColor, "#00000000"));
                views.setTextColor(R.id.widget_shift_text, Color.WHITE);
            } else {
                // No shift, so no card style
                views.setInt(R.id.widget_shift_text, "setBackgroundColor", Color.TRANSPARENT);
                views.setTextColor(R.id.widget_shift_text, parseColorOrDefault(cell.shiftColor, "#334155"));
            }
        }

        Intent fillInIntent = new Intent();
        fillInIntent.putExtra("date", cell.dateStr);
        views.setOnClickFillInIntent(R.id.widget_day_item_root, fillInIntent);

        return views;
    }

    @Override
    public RemoteViews getLoadingView() {
        return new RemoteViews(context.getPackageName(), R.layout.work_schedule_widget_loading_item);
    }

    @Override
    public int getViewTypeCount() {
        return 1;
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public boolean hasStableIds() {
        return true;
    }

    private int parseColorOrDefault(String color, String fallback) {
        try {
            return Color.parseColor(color);
        } catch (Exception ignored) {
            return Color.parseColor(fallback);
        }
    }

    private static class CellData {
        boolean inMonth;
        boolean isPeriod;
        boolean isHoliday;
        boolean isCalendarNote;
        boolean isToday;
        boolean isSelected;
        int noteCount;
        String dayText;
        String shiftText;
        String noteText;
        String dayColor;
        String shiftColor;
        String noteColor;
        String dateStr;

        static CellData empty() {
            CellData data = new CellData();
            data.inMonth = false;
            data.isPeriod = false;
            data.isToday = false;
            data.dayText = "";
            data.shiftText = "";
            data.noteText = "";
            data.dayColor = "#1E293B";
            data.shiftColor = "#334155";
            data.noteColor = "#64748B";
            data.dateStr = "";
            return data;
        }
    }
}
