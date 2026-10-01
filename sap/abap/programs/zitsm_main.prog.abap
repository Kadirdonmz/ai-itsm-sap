*&---------------------------------------------------------------------*
*& Report ZITSM_MAIN
*&---------------------------------------------------------------------*
REPORT zitsm_main.


INCLUDE zitsm_main_top.
INCLUDE zitsm_main_f01.
INCLUDE zitsm_main_o01.
INCLUDE zitsm_main_i01.


START-OF-SELECTION.

  PERFORM add_column USING 'INCIDENT_NO' 'Incident No'.
  PERFORM add_column USING 'TITLE'       'Başlık'.
  PERFORM add_column USING 'PRIORITY_TEXT'    'Öncelik'.
  PERFORM add_column USING 'STATUS_TEXT'      'Durum'.
  PERFORM add_column USING 'REPORTER'    'Oluşturan'.
  PERFORM add_column USING 'ASSIGNED_TO' 'Atanan'.
  PERFORM add_column USING 'CREATED_ON'  'Oluşturma Tarihi'.

  SELECT * FROM zitsm_incident
    INTO TABLE @gt_incidents
    WHERE incident_no IN @so_inc
      AND reporter    IN @so_rep
      AND assigned_to IN @so_asg
      AND status      IN @so_stat
      AND priority    IN @so_prio
      AND created_on  IN @so_date.

  PERFORM build_display_table.
  gs_layout-coltab_fieldname = 'COLTAB'.

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program       = sy-repid
      i_callback_pf_status_set = 'SET_PF_STATUS'
      i_callback_user_command  = 'HANDLE_USER_COMMAND'
      it_fieldcat              = gt_fieldcat
      is_layout                = gs_layout
    TABLES
      t_outtab                 = gt_display.
