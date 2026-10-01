MODULE user_command_0100 INPUT.

  DATA lv_cur_0100 TYPE dynfnam.
  GET CURSOR FIELD lv_cur_0100.

  CASE lv_cur_0100.
    WHEN 'GS_SCREEN-PRIORITY'.
      gv_cursor = 'GS_SCREEN-STATUS'.
    WHEN 'GS_SCREEN-STATUS'.
      gv_cursor = 'GS_SCREEN-ASSIGNED_TO'.
  ENDCASE.

  CASE sy-ucomm.
    WHEN 'SAVE'.
      TRY.
          zcl_itsm_incident=>update_incident(
            iv_incident_no = gs_screen-incident_no
            iv_priority    = gs_screen-priority
            iv_status      = gs_screen-status
            iv_assigned_to = gs_screen-assigned_to ).

          MESSAGE 'Incident guncellendi' TYPE 'S'.
          LEAVE TO SCREEN 0.

        CATCH zcx_itsm_exception INTO DATA(lx_error).
          MESSAGE lx_error->get_text( ) TYPE 'I'.
      ENDTRY.

    WHEN 'EXIT'.
      LEAVE TO SCREEN 0.
  ENDCASE.

ENDMODULE.


MODULE user_command_0200 INPUT.

  DATA lv_cur TYPE dynfnam.
  GET CURSOR FIELD lv_cur.
  CASE lv_cur.
    WHEN 'GS_NEW-TITLE'.
      gv_cursor = 'GS_NEW-PRIORITY'.
    WHEN 'GS_NEW-PRIORITY'.
      gv_cursor = 'GS_NEW-ASSIGNED_TO'.
    WHEN 'GS_NEW-ASSIGNED_TO'.
      gv_cursor = 'EDITOR'.
  ENDCASE.


  CASE sy-ucomm .
    WHEN 'SAVE_NEW'.
      DATA lv_description TYPE string.

      go_editor_new->get_textstream(
        EXPORTING
          only_when_modified = cl_gui_textedit=>false
        IMPORTING
          text = lv_description ).

      cl_gui_cfw=>flush( ).


      TRY .
          DATA(lv_new_no) = zcl_itsm_incident=>create_incident(
            iv_title = gs_new-title
            iv_description = lv_description
            iv_priority = gs_new-priority
            iv_assigned_to = gs_new-assigned_to ).

          MESSAGE |Incident { lv_new_no } olusturuldu| TYPE 'S'.

          CLEAR gs_new.
          FREE go_container_new.
          FREE go_editor_new.

          LEAVE TO SCREEN 0.

        CATCH zcx_itsm_exception INTO DATA(lx_new_error).
          MESSAGE lx_new_error->get_text( ) TYPE 'I'.
      ENDTRY.

    WHEN 'CANCEL_NEW'.
      CLEAR gs_new.
      FREE go_container_new.
      FREE go_editor_new.
      LEAVE TO SCREEN 0.

  ENDCASE.

ENDMODULE.
