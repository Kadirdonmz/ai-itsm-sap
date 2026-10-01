FORM add_column USING iv_field TYPE c
                      iv_text  TYPE c.

  DATA ls_fieldcat TYPE slis_fieldcat_alv.

  ls_fieldcat-fieldname     = iv_field.
  ls_fieldcat-seltext_l     = iv_text.
  ls_fieldcat-seltext_m     = iv_text.
  ls_fieldcat-seltext_s     = iv_text.
  ls_fieldcat-reptext_ddic  = iv_text.

  APPEND ls_fieldcat TO gt_fieldcat.

ENDFORM.

FORM build_display_table.

  DATA ls_display TYPE ty_display.

  CONSTANTS:
    co_color_open   TYPE i VALUE 5,
    co_color_inprog TYPE i VALUE 3,
    co_color_closed TYPE i VALUE 6.

  CLEAR gt_display.

  LOOP AT gt_incidents INTO DATA(ls_incident).

    CLEAR ls_display.
    MOVE-CORRESPONDING ls_incident TO ls_display.

    CASE ls_incident-status.
      WHEN zcl_itsm_incident=>co_status_open.
        ls_display-status_text = 'Open'.
      WHEN zcl_itsm_incident=>co_status_in_progress.
        ls_display-status_text = 'In Progress'.
      WHEN zcl_itsm_incident=>co_status_closed.
        ls_display-status_text = 'Closed'.
    ENDCASE.

    CASE ls_incident-priority.
      WHEN zcl_itsm_incident=>co_priority_low.
        ls_display-priority_text = 'Low'.
      WHEN zcl_itsm_incident=>co_priority_medium.
        ls_display-priority_text = 'Medium'.
      WHEN zcl_itsm_incident=>co_priority_high.
        ls_display-priority_text = 'High'.
    ENDCASE.

    DATA ls_color TYPE slis_specialcol_alv.
    CLEAR ls_display-coltab.

    CASE ls_incident-status.
      WHEN zcl_itsm_incident=>co_status_open.
        ls_color-color-col = co_color_open.
      WHEN zcl_itsm_incident=>co_status_in_progress.
        ls_color-color-col = co_color_inprog.
      WHEN zcl_itsm_incident=>co_status_closed.
        ls_color-color-col = co_color_closed.
    ENDCASE.

    ls_color-color-int = 0.
    ls_color-color-inv = 0.
    ls_color-fieldname = 'STATUS_TEXT'.

    APPEND ls_color TO ls_display-coltab.

    APPEND ls_display TO gt_display.

  ENDLOOP.

ENDFORM.


FORM handle_user_command USING iv_ucomm    TYPE sy-ucomm
                               is_selfield TYPE slis_selfield.

  CASE iv_ucomm.
    WHEN '&IC1'.
      READ TABLE gt_incidents INTO DATA(ls_sel) INDEX is_selfield-tabindex.
      IF sy-subrc = 0.
        gv_sel_incident = ls_sel-incident_no.

        TRY.
            DATA(ls_incident) = zcl_itsm_incident=>get_incident( gv_sel_incident ).

            gs_screen-incident_no = ls_incident-incident_no.
            gs_screen-title       = ls_incident-title.
            gs_screen-description = ls_incident-description.
            gs_screen-priority    = ls_incident-priority.
            gs_screen-status      = ls_incident-status.
            gs_screen-reporter    = ls_incident-reporter.
            gs_screen-assigned_to = ls_incident-assigned_to.
            gs_screen-created_on  = ls_incident-created_on.
            gs_screen-created_at  = ls_incident-created_at.
            gs_screen-closed_on   = ls_incident-closed_on.
            gs_screen-closed_at   = ls_incident-closed_at.

            CALL SCREEN 0100.

          CATCH zcx_itsm_exception INTO DATA(lx_error).
            MESSAGE lx_error->get_text( ) TYPE 'I'.
        ENDTRY.
        SELECT * FROM zitsm_incident
          INTO TABLE @gt_incidents
          WHERE incident_no IN @so_inc
            AND reporter    IN @so_rep
            AND assigned_to IN @so_asg
            AND status      IN @so_stat
            AND priority    IN @so_prio
            AND created_on  IN @so_date.

        PERFORM build_display_table.
        is_selfield-refresh = 'X'.
      ENDIF.

    WHEN 'NEW_INC'.
      CLEAR gs_new.
      CALL SCREEN 0200.
      SELECT * FROM zitsm_incident
   INTO TABLE @gt_incidents
   WHERE incident_no IN @so_inc
     AND reporter    IN @so_rep
     AND assigned_to IN @so_asg
     AND status      IN @so_stat
     AND priority    IN @so_prio
     AND created_on  IN @so_date.

      PERFORM build_display_table.
      is_selfield-refresh = 'X'.
  ENDCASE.

ENDFORM.

FORM set_pf_status USING rt_extab TYPE slis_t_extab.
  SET PF-STATUS 'ALV_STATUS'.
ENDFORM.
