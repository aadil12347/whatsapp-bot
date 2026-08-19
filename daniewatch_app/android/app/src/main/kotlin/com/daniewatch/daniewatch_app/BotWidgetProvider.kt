package com.daniewatch.daniewatch_app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetProvider

class BotWidgetProvider : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences
    ) {
        for (widgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.bot_widget_layout)

            val userNumber = widgetData.getString("bot_user_number", null) ?: "WhatsApp Bot"
            val status = widgetData.getString("bot_status", null) ?: "stopped"

            views.setTextViewText(R.id.widget_user_number, userNumber)
            views.setTextViewText(R.id.widget_status, status.uppercase())

            val isStarted = status.lowercase() == "started"

            if (isStarted) {
                views.setTextColor(R.id.widget_status, 0xFF10B981.toInt())
                views.setTextViewText(R.id.widget_started_at, "ONLINE")
                // Show STOP action button
                views.setTextViewText(R.id.widget_action_button, "STOP")
                views.setInt(R.id.widget_action_button, "setBackgroundResource", R.drawable.widget_btn_red)
            } else if (status.lowercase() == "starting" || status.lowercase() == "stopping") {
                views.setTextColor(R.id.widget_status, 0xFFF59E0B.toInt())
                views.setTextViewText(R.id.widget_started_at, status.uppercase())
                views.setTextViewText(R.id.widget_action_button, status.uppercase())
                views.setInt(R.id.widget_action_button, "setBackgroundResource", R.drawable.widget_btn_green)
            } else {
                views.setTextColor(R.id.widget_status, 0xFFEF4444.toInt())
                views.setTextViewText(R.id.widget_started_at, "OFFLINE")
                // Show START action button
                views.setTextViewText(R.id.widget_action_button, "START")
                views.setInt(R.id.widget_action_button, "setBackgroundResource", R.drawable.widget_btn_green)
            }

            // Action button PendingIntent (toggles bot action or opens app)
            val actionIntent = Intent(context, MainActivity::class.java).apply {
                data = Uri.parse(if (isStarted) "daniewatch://stop" else "daniewatch://start")
                action = Intent.ACTION_VIEW
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val actionPendingIntent = PendingIntent.getActivity(
                context,
                101,
                actionIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_action_button, actionPendingIntent)

            // Tap header to open main app
            val appIntent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_MAIN
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val appPendingIntent = PendingIntent.getActivity(
                context,
                100,
                appIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_user_number, appPendingIntent)

            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
