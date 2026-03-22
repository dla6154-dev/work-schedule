package com.workschedule.widget;

import android.util.Log;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.text.SimpleDateFormat;

public class WorkScheduleWidgetProvider extends AppWidgetProvider {
    private static final String TAG = "WorkScheduleWidget";
    public static final String PREFS_NAME = "work_widget_prefs";
    public static final String ACTION_PREV_MONTH = "com.workschedule.widget.PREV_MONTH";
    public static final String ACTION_NEXT_MONTH = "com.workschedule.widget.NEXT_MONTH";
    public static final String ACTION_SELECT_DATE = "com.workschedule.widget.SELECT_DATE";
    private static final int MAX_NOTE_CARDS = 5;
    private static final int[] NOTE_CARD_IDS = {
            R.id.widget_note_card_1,
            R.id.widget_note_card_2,
            R.id.widget_note_card_3,
            R.id.widget_note_card_4,
            R.id.widget_note_card_5
    };
    private static final int[] NOTE_CARD_TEXT_IDS = {
            R.id.widget_note_card_1_text,
            R.id.widget_note_card_2_text,
            R.id.widget_note_card_3_text,
            R.id.widget_note_card_4_text,
            R.id.widget_note_card_5_text
    };
    private static final int[] NOTE_CARD_TYPE_IDS = {
            R.id.widget_note_card_1_type,
            R.id.widget_note_card_2_type,
            R.id.widget_note_card_3_type,
            R.id.widget_note_card_4_type,
            R.id.widget_note_card_5_type
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateAppWidgets(context, appWidgetManager, appWidgetIds);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null) return;
        String action = intent.getAction();

        if (ACTION_PREV_MONTH.equals(action) || ACTION_NEXT_MONTH.equals(action)) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            int offset = prefs.getInt("monthOffset", 0);
            if (ACTION_PREV_MONTH.equals(action)) {
                offset = Math.max(offset - 1, -1);
            } else {
                offset = Math.min(offset + 1, 1);
            }
            prefs.edit().putInt("monthOffset", offset).apply();
            updateAllWidgets(context);

        } else if (ACTION_SELECT_DATE.equals(action)) {
            String dateStr = intent.getStringExtra("date");
            if (dateStr == null || dateStr.isEmpty()) return;

            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String selectedDate = prefs.getString("selectedDate", "");

            if (dateStr.equals(selectedDate)) {
                // 같은 날짜 두 번 클릭 → 앱 열기
                prefs.edit().remove("selectedDate").apply();
                Intent appIntent = new Intent(context, MainActivity.class);
                appIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                context.startActivity(appIntent);
            } else {
                // 첫 번째 클릭 → 해당 날짜 선택, 패널 갱신
                prefs.edit().putString("selectedDate", dateStr).apply();
                updateAllWidgets(context);
            }

        } else if (Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            updateAllWidgets(context);
        }
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName componentName = new ComponentName(context, WorkScheduleWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(componentName);
        updateAppWidgets(context, appWidgetManager, appWidgetIds);
    }

    public static void updateAppWidgets(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        Log.d(TAG, "updateAppWidgets 호출 — 위젯 수=" + appWidgetIds.length);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int offset = prefs.getInt("monthOffset", 0);

        String monthLabel;
        if (offset == -1) {
            monthLabel = prefs.getString("prevMonthLabel", "");
        } else if (offset == 1) {
            monthLabel = prefs.getString("nextMonthLabel", "");
        } else {
            monthLabel = prefs.getString("monthLabel", "");
        }

        // 선택된 날짜 (없으면 오늘)
        String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.KOREA).format(new Date());
        String selectedDate = prefs.getString("selectedDate", "");
        if (selectedDate.isEmpty()) selectedDate = todayStr;

        // 선택된 날짜의 셀 데이터 검색
        DayData dayData = findDayData(prefs, selectedDate);
        String panelLabel = formatDateLabel(selectedDate) + " 일정";
        List<NoteItem> noteItems = dayData != null ? dayData.notes : new ArrayList<>();

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.work_schedule_widget);
            views.setTextViewText(R.id.widget_month_label, monthLabel);

            // 이전 달 버튼
            Intent prevIntent = new Intent(context, WorkScheduleWidgetProvider.class);
            prevIntent.setAction(ACTION_PREV_MONTH);
            PendingIntent prevPending = PendingIntent.getBroadcast(
                    context, 0, prevIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_btn_prev, prevPending);

            // 다음 달 버튼
            Intent nextIntent = new Intent(context, WorkScheduleWidgetProvider.class);
            nextIntent.setAction(ACTION_NEXT_MONTH);
            PendingIntent nextPending = PendingIntent.getBroadcast(
                    context, 1, nextIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_btn_next, nextPending);

            // 화살표 색상 (경계에서 흐리게)
            int prevColor = (offset <= -1) ? 0xFFCBD5E1 : 0xFF475569;
            int nextColor = (offset >= 1) ? 0xFFCBD5E1 : 0xFF475569;
            views.setTextColor(R.id.widget_btn_prev, prevColor);
            views.setTextColor(R.id.widget_btn_next, nextColor);

            // 패널 날짜 라벨
            views.setTextViewText(R.id.widget_today_label, panelLabel);

            // 패널 카드 구성
            boolean hasItems = !noteItems.isEmpty();
            views.setViewVisibility(
                    R.id.widget_today_empty,
                    hasItems ? android.view.View.GONE : android.view.View.VISIBLE
            );

            for (int i = 0; i < NOTE_CARD_IDS.length; i++) {
                int cardId   = NOTE_CARD_IDS[i];
                int textId   = NOTE_CARD_TEXT_IDS[i];
                int typeId   = NOTE_CARD_TYPE_IDS[i];
                if (i < noteItems.size()) {
                    NoteItem item = noteItems.get(i);
                    views.setViewVisibility(cardId, android.view.View.VISIBLE);
                    views.setTextViewText(textId, item.label);
                    switch (item.kind) {
                        case "shift":
                            views.setInt(cardId, "setBackgroundColor", item.color);
                            views.setTextColor(textId, Color.WHITE);
                            views.setTextViewText(typeId, "");
                            break;
                        case "holiday":
                            views.setInt(cardId, "setBackgroundResource", R.drawable.widget_note_card_holiday_bg);
                            views.setTextColor(textId, Color.parseColor("#9F1239"));
                            views.setTextViewText(typeId, "자동");
                            views.setTextColor(typeId, Color.parseColor("#FDA4AF"));
                            break;
                        case "calendar":
                            views.setInt(cardId, "setBackgroundResource", R.drawable.widget_note_card_calendar_bg);
                            views.setTextColor(textId, Color.parseColor("#0E7490"));
                            views.setTextViewText(typeId, "캘린더");
                            views.setTextColor(typeId, Color.parseColor("#67E8F9"));
                            break;
                        case "period":
                            views.setInt(cardId, "setBackgroundResource", R.drawable.widget_note_card_bg);
                            views.setTextColor(textId, Color.parseColor("#059669"));
                            views.setTextViewText(typeId, "기간 일정");
                            views.setTextColor(typeId, Color.parseColor("#6EE7B7"));
                            break;
                        default: // "note"
                            views.setInt(cardId, "setBackgroundResource", R.drawable.widget_note_card_bg);
                            views.setTextColor(textId, Color.parseColor("#3730A3"));
                            views.setTextViewText(typeId, "당일 일정");
                            views.setTextColor(typeId, Color.parseColor("#A5B4FC"));
                            break;
                    }
                } else {
                    views.setViewVisibility(cardId, android.view.View.GONE);
                }
            }

            // 달력 그리드 어댑터
            Intent serviceIntent = new Intent(context, WorkScheduleGridService.class);
            serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
            views.setRemoteAdapter(R.id.widget_calendar_grid, serviceIntent);
            views.setEmptyView(R.id.widget_calendar_grid, R.id.widget_empty);

            // 셀 클릭 → SELECT_DATE 브로드캐스트 (fillInIntent의 "date" extra가 병합됨)
            // FLAG_MUTABLE 필수: fillInIntent를 병합하려면 mutable이어야 함
            Intent selectIntent = new Intent(context, WorkScheduleWidgetProvider.class);
            selectIntent.setAction(ACTION_SELECT_DATE);
            PendingIntent selectTemplate = PendingIntent.getBroadcast(
                    context,
                    appWidgetId + 1000,
                    selectIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
            );
            views.setPendingIntentTemplate(R.id.widget_calendar_grid, selectTemplate);

            // 위젯 빈 영역 클릭 → 앱 열기
            Intent openAppIntent = new Intent(context, MainActivity.class);
            openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent openAppPending = PendingIntent.getActivity(
                    context,
                    appWidgetId + 2000,
                    openAppIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_root, openAppPending);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
        appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_calendar_grid);
        Log.d(TAG, "notifyAppWidgetViewDataChanged 완료");
    }

    /** 저장된 셀 JSON에서 dateStr에 맞는 셀의 allNotes를 찾아 반환 */
    private static DayData findDayData(SharedPreferences prefs, String targetDate) {
        String[] keys = {"prevMonthCellsJson", "monthCellsJson", "nextMonthCellsJson"};
        for (String key : keys) {
            String json = prefs.getString(key, "[]");
            try {
                JSONArray arr = new JSONArray(json);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject cell = arr.optJSONObject(i);
                    if (cell == null) continue;
                    if (!targetDate.equals(cell.optString("dateStr"))) continue;

                    JSONArray allNotes = cell.optJSONArray("allNotes");
                    List<NoteItem> items = new ArrayList<>();
                    if (allNotes != null) {
                        for (int j = 0; j < allNotes.length() && j < MAX_NOTE_CARDS; j++) {
                            JSONObject note = allNotes.optJSONObject(j);
                            if (note == null) continue;
                            String label = note.optString("label", "").trim();
                            if (label.isEmpty()) continue;
                            String kind = note.optString("kind", "note");
                            int color = Color.TRANSPARENT;
                            if ("shift".equals(kind)) {
                                String colorStr = note.optString("color", "#334155");
                                try { color = Color.parseColor(colorStr); } catch (Exception ignored) {}
                            }
                            items.add(new NoteItem(label, kind, color));
                        }
                    }
                    return new DayData(items);
                }
            } catch (Exception ignored) {}
        }
        return null;
    }

    /** "yyyy-MM-dd" → "M월 d일" */
    private static String formatDateLabel(String dateStr) {
        if (dateStr == null || dateStr.length() < 10) return dateStr != null ? dateStr : "";
        try {
            String[] parts = dateStr.split("-");
            int month = Integer.parseInt(parts[1]);
            int day = Integer.parseInt(parts[2]);
            return month + "월 " + day + "일";
        } catch (Exception ignored) {
            return dateStr;
        }
    }

    private static class DayData {
        final List<NoteItem> notes;
        DayData(List<NoteItem> notes) { this.notes = notes; }
    }

    private static class NoteItem {
        final String label;
        final String kind;
        final int color;
        NoteItem(String label, String kind, int color) {
            this.label = label;
            this.kind = kind;
            this.color = color;
        }
    }
}
