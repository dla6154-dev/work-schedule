package com.workschedule.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    private static final String TAG = "WidgetBridge";

    @PluginMethod
    public void syncWidgetData(PluginCall call) {
        Log.d(TAG, "syncWidgetData 호출됨");
        Context context = getContext();
        if (context == null) {
            Log.e(TAG, "Context null — 위젯 업데이트 불가");
            call.reject("Context not available");
            return;
        }

        String monthLabel = call.getString("monthLabel", "");
        String monthCellsJson = call.getString("monthCellsJson", "[]");
        String prevMonthLabel = call.getString("prevMonthLabel", "");
        String prevMonthCellsJson = call.getString("prevMonthCellsJson", "[]");
        String nextMonthLabel = call.getString("nextMonthLabel", "");
        String nextMonthCellsJson = call.getString("nextMonthCellsJson", "[]");
        String todayDateLabel = call.getString("todayDateLabel", "");
        String todayNotesJson = call.getString("todayNotesJson", "[]");

        SharedPreferences prefs = context.getSharedPreferences(
                WorkScheduleWidgetProvider.PREFS_NAME,
                Context.MODE_PRIVATE
        );

        boolean hasChanged =
                !monthLabel.equals(prefs.getString("monthLabel", "")) ||
                !monthCellsJson.equals(prefs.getString("monthCellsJson", "[]")) ||
                !prevMonthLabel.equals(prefs.getString("prevMonthLabel", "")) ||
                !prevMonthCellsJson.equals(prefs.getString("prevMonthCellsJson", "[]")) ||
                !nextMonthLabel.equals(prefs.getString("nextMonthLabel", "")) ||
                !nextMonthCellsJson.equals(prefs.getString("nextMonthCellsJson", "[]")) ||
                !todayDateLabel.equals(prefs.getString("todayDateLabel", "")) ||
                !todayNotesJson.equals(prefs.getString("todayNotesJson", "[]"));

        Log.d(TAG, "hasChanged=" + hasChanged + " monthLabel=" + monthLabel);

        if (hasChanged) {
            Log.d(TAG, "데이터 변경 감지 → SharedPreferences 저장 시작");
            boolean committed = prefs.edit()
                    .putString("monthLabel", monthLabel)
                    .putString("monthCellsJson", monthCellsJson)
                    .putString("prevMonthLabel", prevMonthLabel)
                    .putString("prevMonthCellsJson", prevMonthCellsJson)
                    .putString("nextMonthLabel", nextMonthLabel)
                    .putString("nextMonthCellsJson", nextMonthCellsJson)
                    .putString("todayDateLabel", todayDateLabel)
                    .putString("todayNotesJson", todayNotesJson)
                    .putInt("monthOffset", 0)
                    .commit();
            Log.d(TAG, "SharedPreferences commit 결과=" + committed);

            Log.d(TAG, "updateAllWidgets 호출");
            WorkScheduleWidgetProvider.updateAllWidgets(context);
            Log.d(TAG, "updateAllWidgets 완료");
        } else {
            Log.d(TAG, "데이터 변경 없음 → 위젯 업데이트 스킵");
        }

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("changed", hasChanged);
        call.resolve(result);
    }
}
