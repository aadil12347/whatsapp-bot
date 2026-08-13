package com.daniewatch.daniewatch_app

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetProvider

class BotWidgetProvider : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences
    ) {
        appWidgetIds.forEach { widgetId ->
            val views = RemoteViews(context.packageName, R.layout.bot_widget_layout).apply {
                val userNumber = widgetData.getString("bot_user_number", "WhatsApp Bot")
                val status = widgetData.getString("bot_status", "stopped")
                val startedAt = widgetData.getString("bot_started_at", "")

                setTextViewText(R.id.widget_user_number, userNumber ?: "WhatsApp Bot")
                setTextViewText(R.id.widget_status, status?.uppercase() ?: "STOPPED")

                if (status.equals("started", ignoreCase = true) && !startedAt.isNullOrEmpty()) {
                    setTextViewText(R.id.widget_started_at, "Running...")
                } else {
                    setTextViewText(R.id.widget_started_at, "Offline")
                }
            }
            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
