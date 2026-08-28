import 'package:flutter/material.dart';
import '../models/server_priority.dart';
import '../theme/app_theme.dart';

/// Drag-to-reorder bottom sheet for configuring download server fallback priority.
class ServerPrioritySettings extends StatefulWidget {
  const ServerPrioritySettings({super.key});

  /// Show as a modal bottom sheet
  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => const ServerPrioritySettings(),
    );
  }

  @override
  State<ServerPrioritySettings> createState() => _ServerPrioritySettingsState();
}

class _ServerPrioritySettingsState extends State<ServerPrioritySettings> {
  late List<DownloadServer> _order;
  bool _hasChanges = false;
  bool _isSaved = false;

  @override
  void initState() {
    super.initState();
    _order = List.from(ServerPriorityManager.getOrder());
  }

  Future<void> _saveOrder() async {
    await ServerPriorityManager.setOrder(_order);
    if (!mounted) return;
    setState(() {
      _hasChanges = false;
      _isSaved = true;
    });
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) {
        setState(() => _isSaved = false);
      }
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle_rounded,
                color: AppTheme.champagne, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Server priority saved: ${ServerPriorityManager.getOrderDisplayString()}',
                style: const TextStyle(
                  color: AppTheme.champagne,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ),
          ],
        ),
        backgroundColor: AppTheme.emeraldInk,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 3),
      ),
    );
  }

  Future<void> _resetToDefault() async {
    await ServerPriorityManager.resetToDefault();
    if (!mounted) return;
    setState(() {
      _order = List.from(ServerPriorityManager.getOrder());
      _hasChanges = false;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Row(
          children: [
            Icon(Icons.restore_rounded, color: AppTheme.champagne, size: 20),
            SizedBox(width: 10),
            Text(
              'Server priority reset to default',
              style: TextStyle(
                color: AppTheme.champagne,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ],
        ),
        backgroundColor: AppTheme.emeraldInk,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  String _ordinalLabel(int index) {
    switch (index) {
      case 0:
        return '1st';
      case 1:
        return '2nd';
      case 2:
        return '3rd';
      default:
        return '${index + 1}th';
    }
  }

  Color _priorityColor(int index) {
    switch (index) {
      case 0:
        return AppTheme.champagne;
      case 1:
        return AppTheme.champagne.withOpacity(0.7);
      case 2:
        return AppTheme.champagne.withOpacity(0.5);
      default:
        return AppTheme.textMuted;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.bgModal,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle bar
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.champagne.withOpacity(0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),

            // Title
            const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.flash_on_rounded,
                    color: AppTheme.champagne, size: 20),
                SizedBox(width: 8),
                Text(
                  'Download Server Priority',
                  style: TextStyle(
                    color: AppTheme.champagne,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Drag to reorder fallback sequence',
              style: TextStyle(
                color: AppTheme.champagne.withOpacity(0.6),
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 16),

            // Reorderable List
            SizedBox(
              height: _order.length * 78.0,
              child: ReorderableListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _order.length,
                onReorder: (oldIndex, newIndex) {
                  setState(() {
                    if (newIndex > oldIndex) newIndex--;
                    final item = _order.removeAt(oldIndex);
                    _order.insert(newIndex, item);
                    _hasChanges = true;
                    _isSaved = false;
                  });
                },
                proxyDecorator: (child, index, animation) {
                  return Material(
                    color: Colors.transparent,
                    elevation: 8,
                    shadowColor: AppTheme.offBlack.withOpacity(0.6),
                    borderRadius: BorderRadius.circular(14),
                    child: child,
                  );
                },
                itemBuilder: (context, index) {
                  final server = _order[index];
                  final color = _priorityColor(index);

                  return Container(
                    key: ValueKey(server),
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppTheme.bgSurface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: color.withOpacity(0.4),
                        width: 1.2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.15),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        // Priority badge
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: color.withOpacity(0.18),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                                color: color.withOpacity(0.5), width: 1.2),
                          ),
                          child: Center(
                            child: Text(
                              _ordinalLabel(index),
                              style: TextStyle(
                                color: color,
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 14),

                        // Server name + description
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                server.displayName,
                                style: TextStyle(
                                  color: color,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                server.description,
                                style: const TextStyle(
                                  color: AppTheme.textMuted,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),

                        // Drag handle
                        Icon(
                          Icons.drag_handle_rounded,
                          color: color.withOpacity(0.6),
                          size: 24,
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),

            const SizedBox(height: 12),

            // Action buttons
            Row(
              children: [
                // Reset button
                Expanded(
                  child: GestureDetector(
                    onTap: _resetToDefault,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: AppTheme.bgSurface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: AppTheme.champagne.withOpacity(0.3)),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.restore_rounded,
                              color: AppTheme.textMuted, size: 18),
                          SizedBox(width: 6),
                          Text(
                            'Reset Default',
                            style: TextStyle(
                              color: AppTheme.textMuted,
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),

                // Save button
                Expanded(
                  child: GestureDetector(
                    onTap: _hasChanges ? _saveOrder : null,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: _isSaved
                            ? AppTheme.champagne
                            : _hasChanges
                                ? AppTheme.emeraldInk
                                : AppTheme.bgSurface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _isSaved
                              ? AppTheme.champagne
                              : AppTheme.champagne.withOpacity(0.4),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            _isSaved
                                ? Icons.check_circle_rounded
                                : Icons.save_rounded,
                            color: _isSaved
                                ? AppTheme.offBlack
                                : _hasChanges
                                    ? AppTheme.champagne
                                    : AppTheme.textMuted,
                            size: 18,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            _isSaved ? 'Saved!' : 'Save Order',
                            style: TextStyle(
                              color: _isSaved
                                  ? AppTheme.offBlack
                                  : _hasChanges
                                      ? AppTheme.champagne
                                      : AppTheme.textMuted,
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
