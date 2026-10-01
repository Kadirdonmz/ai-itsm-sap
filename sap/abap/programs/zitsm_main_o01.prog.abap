MODULE status_0100 OUTPUT.

  SET PF-STATUS '0100'.
  SET TITLEBAR '0100'.

  DATA lv_val TYPE domvalue_l.

  lv_val = gs_screen-priority.
  gs_screen-priority_text = zcl_itsm_incident=>get_domain_text(
                              iv_domname = 'ZITSM_PRIORITY'
                              iv_value   = lv_val ).

  lv_val = gs_screen-status.
  gs_screen-status_text = zcl_itsm_incident=>get_domain_text(
                            iv_domname = 'ZITSM_STATUS'
                            iv_value   = lv_val ).

  IF go_container IS INITIAL.
    CREATE OBJECT go_container
      EXPORTING
        container_name = 'CC_DESCRIPTION'.

    CREATE OBJECT go_editor
      EXPORTING
        parent = go_container.

    go_editor->set_readonly_mode( 1 ).
    go_editor->set_toolbar_mode( 0 ).
    go_editor->set_statusbar_mode( 0 ).
  ENDIF.

  go_editor->set_textstream( EXPORTING text = gs_screen-description ).

  IF gv_cursor IS NOT INITIAL.
    SET CURSOR FIELD gv_cursor.
    CLEAR gv_cursor.
  ENDIF.
ENDMODULE.

MODULE status_0200 OUTPUT.

  SET PF-STATUS '0200'.
  SET TITLEBAR '0200'.

  DATA lv_val_new TYPE domvalue_l.

  lv_val_new = gs_new-priority.
  gs_new-priority_text = zcl_itsm_incident=>get_domain_text(
                          iv_domname = 'ZITSM_PRIORITY'
                          iv_value = lv_val_new ).

  IF go_container_new IS INITIAL.
    CREATE OBJECT go_container_new
      EXPORTING
        container_name = 'CC_DESCRIPTION_NEW'.
    CREATE OBJECT go_editor_new
      EXPORTING
        parent = go_container_new.

    go_editor_new->set_toolbar_mode( 0 ).
    go_editor_new->set_statusbar_mode( 0 ).

  ENDIF.

  IF gv_cursor = 'EDITOR'.
    cl_gui_control=>set_focus( control = go_editor_new ).
    CLEAR gv_cursor.
  ELSEIF gv_cursor IS NOT INITIAL.
    SET CURSOR FIELD gv_cursor.
    CLEAR gv_cursor.
  ENDIF.
ENDMODULE.
