package com.workschedule.widget;

import android.Manifest;
import android.database.Cursor;
import android.provider.CalendarContract;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

@CapacitorPlugin(
    name = "CalendarBridge",
    permissions = {
        @Permission(strings = {Manifest.permission.READ_CALENDAR}, alias = "calendar")
    }
)
public class CalendarBridgePlugin extends Plugin {

    private static final String TAG = "CalendarBridge";

    /** 권한 상태 확인 */
    @PluginMethod
    public void checkCalendarPermission(PluginCall call) {
        boolean granted = getPermissionState("calendar") == PermissionState.GRANTED;
        Log.d(TAG, "checkCalendarPermission: " + granted);
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    /** 권한 요청 — 시스템 팝업 표시 */
    @PluginMethod
    public void requestCalendarPermission(PluginCall call) {
        Log.d(TAG, "requestCalendarPermission 호출");
        if (getPermissionState("calendar") == PermissionState.GRANTED) {
            Log.d(TAG, "이미 권한 있음 — 바로 반환");
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        } else {
            Log.d(TAG, "권한 없음 — 팝업 요청");
            requestPermissionForAlias("calendar", call, "onCalendarPermResult");
        }
    }

    @PermissionCallback
    private void onCalendarPermResult(PluginCall call) {
        boolean granted = getPermissionState("calendar") == PermissionState.GRANTED;
        Log.d(TAG, "권한 결과: " + (granted ? "허용" : "거부"));
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    /**
     * 날짜 범위 내 캘린더 이벤트 조회
     * params: startDate "yyyy-MM-dd", endDate "yyyy-MM-dd" (endDate 미포함)
     * returns: { events: { "2026-03-22": ["이벤트1", "이벤트2"], ... } }
     */
    @PluginMethod
    public void getEventsRange(PluginCall call) {
        Log.d(TAG, "getEventsRange 호출");
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            Log.w(TAG, "캘린더 권한 없음");
            JSObject result = new JSObject();
            result.put("events", new JSONObject());
            call.resolve(result);
            return;
        }

        String startDate = call.getString("startDate");
        String endDate   = call.getString("endDate");
        if (startDate == null || endDate == null) {
            call.reject("startDate와 endDate가 필요합니다");
            return;
        }

        try {
            SimpleDateFormat localSdf = new SimpleDateFormat("yyyy-MM-dd", Locale.KOREA);
            localSdf.setTimeZone(TimeZone.getDefault());
            SimpleDateFormat utcSdf = new SimpleDateFormat("yyyy-MM-dd", Locale.KOREA);
            utcSdf.setTimeZone(TimeZone.getTimeZone("UTC"));

            Date start = localSdf.parse(startDate);
            Date end   = localSdf.parse(endDate);
            if (start == null || end == null) {
                call.reject("날짜 형식 오류");
                return;
            }

            // 절기·세시풍속 캘린더 ID 수집 → 이벤트 쿼리에서 제외
            java.util.Set<Long> excludeCalIds = new java.util.HashSet<>();
            String[] calProj = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            };
            Cursor calCursor = getContext().getContentResolver().query(
                CalendarContract.Calendars.CONTENT_URI, calProj, null, null, null
            );
            if (calCursor != null) {
                int calIdIdx   = calCursor.getColumnIndex(CalendarContract.Calendars._ID);
                int calNameIdx = calCursor.getColumnIndex(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME);
                while (calCursor.moveToNext()) {
                    String calName = calCursor.getString(calNameIdx);
                    if (calName != null && (calName.contains("절기") || calName.contains("세시풍속"))) {
                        excludeCalIds.add(calCursor.getLong(calIdIdx));
                        Log.d(TAG, "제외 캘린더: " + calName + " (id=" + calCursor.getLong(calIdIdx) + ")");
                    }
                }
                calCursor.close();
            }

            String[] projection = {
                CalendarContract.Events.TITLE,
                CalendarContract.Events.DTSTART,
                CalendarContract.Events.ALL_DAY,
            };

            StringBuilder selection = new StringBuilder(
                CalendarContract.Events.DTSTART + " >= ? AND " +
                CalendarContract.Events.DTSTART + " < ? AND " +
                CalendarContract.Events.DELETED  + " = 0"
            );
            // 절기·세시풍속 캘린더 제외
            if (!excludeCalIds.isEmpty()) {
                StringBuilder idList = new StringBuilder();
                for (Long id : excludeCalIds) {
                    if (idList.length() > 0) idList.append(",");
                    idList.append(id);
                }
                selection.append(" AND ").append(CalendarContract.Events.CALENDAR_ID)
                         .append(" NOT IN (").append(idList).append(")");
            }
            String[] args = { String.valueOf(start.getTime()), String.valueOf(end.getTime()) };

            Map<String, JSONArray> map = new HashMap<>();
            Cursor cursor = getContext().getContentResolver().query(
                CalendarContract.Events.CONTENT_URI, projection, selection.toString(), args,
                CalendarContract.Events.DTSTART + " ASC"
            );
            if (cursor != null) {
                int ti = cursor.getColumnIndex(CalendarContract.Events.TITLE);
                int di = cursor.getColumnIndex(CalendarContract.Events.DTSTART);
                int ai = cursor.getColumnIndex(CalendarContract.Events.ALL_DAY);
                while (cursor.moveToNext()) {
                    String title = cursor.getString(ti);
                    long   dtStart = cursor.getLong(di);
                    int    allDay  = cursor.getInt(ai);
                    if (title == null || title.trim().isEmpty()) continue;
                    String dateStr = (allDay == 1)
                        ? utcSdf.format(new Date(dtStart))
                        : localSdf.format(new Date(dtStart));
                    if (!map.containsKey(dateStr)) map.put(dateStr, new JSONArray());
                    map.get(dateStr).put(title.trim());
                }
                cursor.close();
            }

            JSONObject eventsObj = new JSONObject();
            for (Map.Entry<String, JSONArray> e : map.entrySet()) eventsObj.put(e.getKey(), e.getValue());
            JSObject jsResult = new JSObject();
            jsResult.put("events", eventsObj);
            call.resolve(jsResult);
            Log.d(TAG, "getEventsRange 완료: " + eventsObj.length() + "일");

        } catch (Exception e) {
            Log.e(TAG, "getEventsRange 오류", e);
            JSObject result = new JSObject();
            result.put("events", new JSONObject());
            call.resolve(result);
        }
    }
}
