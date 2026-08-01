import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Search Bar styled with glassmorphism, floating 3D elevation, and active glow aura.
class SearchBarWidget extends StatefulWidget {
  final Function(String) onSearch;
  final VoidCallback onClear;
  final bool isSearchMode;
  final String currentQuery;

  const SearchBarWidget({
    super.key,
    required this.onSearch,
    required this.onClear,
    required this.isSearchMode,
    required this.currentQuery,
  });

  @override
  State<SearchBarWidget> createState() => _SearchBarWidgetState();
}

class _SearchBarWidgetState extends State<SearchBarWidget> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  bool _isFocused = false;

  @override
  void initState() {
    super.initState();
    _controller.text = widget.currentQuery;
    _focusNode.addListener(() {
      if (mounted) {
        setState(() {
          _isFocused = _focusNode.hasFocus;
        });
      }
    });
  }

  @override
  void didUpdateWidget(SearchBarWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.isSearchMode && oldWidget.isSearchMode) {
      _controller.clear();
    } else if (widget.currentQuery != oldWidget.currentQuery) {
      _controller.text = widget.currentQuery;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _clearSearch() {
    _controller.clear();
    _focusNode.unfocus();
    widget.onClear();
  }

  void _submit() {
    final q = _controller.text.trim();
    if (q.isNotEmpty) {
      _focusNode.unfocus();
      widget.onSearch(q);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool isActive = _isFocused;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(35),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 12.0, sigmaY: 12.0),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOutCubic,
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
            decoration: BoxDecoration(
              color: isActive
                  ? AppTheme.bgSurface.withOpacity(0.85)
                  : AppTheme.bgSurface.withOpacity(0.65),
              borderRadius: BorderRadius.circular(35),
              border: Border.all(
                color: isActive
                    ? AppTheme.champagne
                    : AppTheme.emeraldInk.withOpacity(0.45),
                width: isActive ? 1.8 : 1.2,
              ),
              boxShadow: [
                // Active aura glow behind search bar
                if (isActive)
                  BoxShadow(
                    color: AppTheme.champagne.withOpacity(0.35),
                    blurRadius: 24,
                    spreadRadius: 2,
                    offset: const Offset(0, 2),
                  ),
                // Deep 3D elevation shadow
                BoxShadow(
                  color: AppTheme.offBlack.withOpacity(0.65),
                  blurRadius: isActive ? 22 : 12,
                  offset: const Offset(0, 6),
                  spreadRadius: 1,
                ),
                // Accent glow shadow
                BoxShadow(
                  color: AppTheme.emeraldInk.withOpacity(isActive ? 0.6 : 0.25),
                  blurRadius: isActive ? 16 : 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              children: [
                const SizedBox(width: 14),
                AnimatedScale(
                  scale: isActive ? 1.15 : 1.0,
                  duration: const Duration(milliseconds: 180),
                  child: Icon(
                    Icons.search_rounded,
                    color: isActive ? AppTheme.champagne : AppTheme.textMuted,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _controller,
                    focusNode: _focusNode,
                    style: const TextStyle(
                      color: AppTheme.champagne,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                    decoration: const InputDecoration(
                      hintText: 'Search movies & series...',
                      hintStyle: TextStyle(color: AppTheme.textMuted, fontSize: 14),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(vertical: 12),
                    ),
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => _submit(),
                  ),
                ),
                if (widget.isSearchMode || _controller.text.isNotEmpty)
                  GestureDetector(
                    onTap: _clearSearch,
                    child: Container(
                      margin: const EdgeInsets.only(right: 4),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppTheme.emeraldInk.withOpacity(0.35),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.close_rounded,
                          color: AppTheme.champagne, size: 18),
                    ),
                  )
                else
                  GestureDetector(
                    onTap: _submit,
                    child: Container(
                      margin: const EdgeInsets.only(right: 4),
                      padding:
                          const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      decoration: BoxDecoration(
                        color: AppTheme.emeraldInk,
                        borderRadius: BorderRadius.circular(28),
                        border: Border.all(color: AppTheme.champagne.withOpacity(0.35)),
                        boxShadow: [
                          BoxShadow(
                            color: AppTheme.offBlack.withOpacity(0.3),
                            blurRadius: 4,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: const Icon(Icons.search_rounded,
                          color: AppTheme.champagne, size: 20),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
