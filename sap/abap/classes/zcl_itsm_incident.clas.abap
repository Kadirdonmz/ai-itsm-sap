CLASS zcl_itsm_incident DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.

    TYPES:
      tt_incident TYPE STANDARD TABLE OF zitsm_incident WITH DEFAULT KEY .

    CONSTANTS co_status_open TYPE zitsm_de_status VALUE 'O' ##NO_TEXT.
    CONSTANTS co_status_in_progress TYPE zitsm_de_status VALUE 'I' ##NO_TEXT.
    CONSTANTS co_status_resolved TYPE zitsm_de_status VALUE 'R' ##NO_TEXT.
    CONSTANTS co_status_closed TYPE zitsm_de_status VALUE 'C' ##NO_TEXT.
    CONSTANTS co_priority_low TYPE zitsm_de_priority VALUE 'L' ##NO_TEXT.
    CONSTANTS co_priority_medium TYPE zitsm_de_priority VALUE 'M' ##NO_TEXT.
    CONSTANTS co_priority_high TYPE zitsm_de_priority VALUE 'H' ##NO_TEXT.

    CLASS-METHODS create_incident
      IMPORTING
        !iv_category          TYPE zitsm_incident-category OPTIONAL
        !iv_support_group     TYPE zitsm_incident-support_group OPTIONAL
        !iv_request_type      TYPE zitsm_incident-request_type OPTIONAL
        !iv_impact            TYPE zitsm_incident-impact OPTIONAL
        !iv_title             TYPE zitsm_de_title
        !iv_description       TYPE zitsm_de_description
        !iv_priority          TYPE zitsm_de_priority
        !iv_assigned_to       TYPE syuname OPTIONAL
      RETURNING
        VALUE(rv_incident_no) TYPE zitsm_de_incident_no
      RAISING
        zcx_itsm_exception .
    CLASS-METHODS update_incident
      IMPORTING
        !iv_category      TYPE zitsm_incident-category OPTIONAL
        !iv_support_group TYPE zitsm_incident-support_group OPTIONAL
        !iv_request_type  TYPE zitsm_incident-request_type OPTIONAL
        !iv_impact        TYPE zitsm_incident-impact OPTIONAL
        !iv_resolution    TYPE zitsm_incident-resolution OPTIONAL
        !iv_incident_no   TYPE zitsm_de_incident_no
        !iv_priority      TYPE zitsm_de_priority OPTIONAL
        !iv_status        TYPE zitsm_de_status OPTIONAL
        !iv_assigned_to   TYPE syuname OPTIONAL
      RAISING
        zcx_itsm_exception .
    CLASS-METHODS get_incident
      IMPORTING
        !iv_incident_no    TYPE zitsm_de_incident_no
      RETURNING
        VALUE(rs_incident) TYPE zitsm_incident
      RAISING
        zcx_itsm_exception .
    CLASS-METHODS get_domain_text
      IMPORTING
        VALUE(iv_domname) TYPE domname
        VALUE(iv_value)   TYPE domvalue_l
        !iv_langu         TYPE ddlanguage DEFAULT sy-langu
      RETURNING
        VALUE(rv_text)    TYPE val_text .
    CLASS-METHODS get_incident_list
      RETURNING
        VALUE(rt_incidents) TYPE tt_incident .
  PROTECTED SECTION.
  PRIVATE SECTION.

    CLASS-METHODS validate_input
      IMPORTING
        !iv_title       TYPE zitsm_de_title
        !iv_description TYPE zitsm_de_description
        !iv_priority    TYPE zitsm_de_priority
      RAISING
        zcx_itsm_exception .
    CLASS-METHODS check_authorization
      IMPORTING
        !iv_reporter    TYPE syuname
        !iv_assigned_to TYPE syuname
      RAISING
        zcx_itsm_exception .
    CLASS-METHODS write_status_log
      IMPORTING
        !iv_incident_no TYPE zitsm_de_incident_no
        !iv_old_status  TYPE zitsm_de_status
        !iv_new_status  TYPE zitsm_de_status .
    CLASS-METHODS get_next_incident_no
      RETURNING
        VALUE(rv_incident_no) TYPE zitsm_de_incident_no .
    CLASS-METHODS send_assignment_mail
      IMPORTING
        !iv_incident_no TYPE zitsm_de_incident_no
        !iv_assigned_to TYPE syuname .
ENDCLASS.


CLASS zcl_itsm_incident IMPLEMENTATION.

  METHOD check_authorization.
    IF sy-uname <> iv_reporter
      AND sy-uname <> iv_assigned_to.
      RAISE EXCEPTION TYPE zcx_itsm_exception
      MESSAGE e006(zitsm).
    ENDIF.
  ENDMETHOD.

  METHOD create_incident.
    validate_input(
      iv_title = iv_title
      iv_description = iv_description
      iv_priority = iv_priority
    ).
    rv_incident_no = get_next_incident_no( ).

    DATA: ls_incident TYPE zitsm_incident.
    ls_incident-incident_no = rv_incident_no.
    ls_incident-title = iv_title.
    ls_incident-description = iv_description.
    ls_incident-priority = iv_priority.
    ls_incident-status = co_status_open.
    ls_incident-reporter = sy-uname.
    ls_incident-assigned_to = iv_assigned_to.
    ls_incident-category = iv_category.
    ls_incident-support_group = iv_support_group.
    ls_incident-request_type = iv_request_type.
    ls_incident-impact = iv_impact.
    ls_incident-created_on = sy-datum.
    ls_incident-created_at = sy-uzeit.

    INSERT zitsm_incident FROM ls_incident.

    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_itsm_exception
        MESSAGE e009(zitsm) WITH rv_incident_no.
    ENDIF.

    IF iv_assigned_to IS NOT INITIAL.
      send_assignment_mail(
          iv_incident_no = rv_incident_no
          iv_assigned_to = iv_assigned_to ).
    ENDIF.

  ENDMETHOD.

  METHOD get_domain_text.

    CONSTANTS lc_active TYPE as4local VALUE 'A'.

    SELECT SINGLE ddtext
      FROM dd07t
      INTO @rv_text
      WHERE domname    = @iv_domname
        AND domvalue_l = @iv_value
        AND ddlanguage = @iv_langu
        AND as4local   = @lc_active.

  ENDMETHOD.

  METHOD get_incident.
    SELECT SINGLE *
      FROM zitsm_incident
      INTO @rs_incident
      WHERE incident_no = @iv_incident_no.

    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_itsm_exception
      MESSAGE e004(zitsm) WITH iv_incident_no.
    ENDIF.
  ENDMETHOD.

  METHOD get_incident_list.
    SELECT *
      FROM zitsm_incident
      INTO TABLE @rt_incidents.
  ENDMETHOD.

  METHOD get_next_incident_no.
    CONSTANTS:lc_nr_object   TYPE nrobj VALUE 'ZITSM_INC',
              lc_nr_interval TYPE nrnr VALUE '01'.
    CALL FUNCTION 'NUMBER_GET_NEXT'
      EXPORTING
        nr_range_nr = lc_nr_interval
        object      = lc_nr_object
      IMPORTING
        number      = rv_incident_no.
  ENDMETHOD.

  METHOD send_assignment_mail.

    SELECT SINGLE email
      FROM zitsm_user
      INTO @DATA(lv_email)
      WHERE username = @iv_assigned_to.

    IF sy-subrc <> 0 OR lv_email IS INITIAL.
      RETURN.
    ENDIF.

    SELECT SINGLE * FROM zitsm_incident
      INTO @DATA(ls_incident)
      WHERE incident_no = @iv_incident_no.

    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    DATA lt_body     TYPE TABLE OF solisti1.
    DATA ls_body     TYPE solisti1.
    DATA ls_docdata  TYPE sodocchgi1.
    DATA lt_receiver TYPE TABLE OF somlreci1.
    DATA ls_receiver TYPE somlreci1.

    ls_docdata-obj_descr = |Incident { iv_incident_no } size atandi|.

    DATA(lv_priority_text) = get_domain_text(
                               iv_domname = 'ZITSM_PRIORITY'
                               iv_value = CONV  domvalue_l( ls_incident-priority ) ).

    DATA(lv_status_text) = get_domain_text(
                             iv_domname = 'ZITSM_STATUS'
                             iv_value = CONV domvalue_l( ls_incident-status ) ).

    ls_body-line = |Merhaba,|.
    APPEND ls_body TO lt_body.
    CLEAR ls_body.
    APPEND ls_body TO lt_body.
    ls_body-line = |{ iv_incident_no } numaralı incident size atanmıştır.|.
    APPEND ls_body TO lt_body.
    CLEAR ls_body.
    APPEND ls_body TO lt_body.
    ls_body-line = |Başlık  : { ls_incident-title }|.
    APPEND ls_body TO lt_body.
    ls_body-line = |Öncelik : { lv_priority_text }|.
    APPEND ls_body TO lt_body.
    ls_body-line = |Durum   : { lv_status_text }|.
    APPEND ls_body TO lt_body.
    CLEAR ls_body.
    APPEND ls_body TO lt_body.
    ls_body-line = |ITSM Incident Yönetim Sistemi|.
    APPEND ls_body TO lt_body.

    ls_receiver-receiver = lv_email.
    ls_receiver-rec_type = 'U'.
    ls_receiver-com_type = 'INT'.
    APPEND ls_receiver TO lt_receiver.

    CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'
      EXPORTING
        document_data              = ls_docdata
        document_type              = 'RAW'
      TABLES
        object_content             = lt_body
        receivers                  = lt_receiver
      EXCEPTIONS
        too_many_receivers         = 1
        document_not_sent          = 2
        operation_no_authorization = 4
        OTHERS                     = 99.

    IF sy-subrc = 0.
      COMMIT WORK.
    ENDIF.

  ENDMETHOD.

  METHOD update_incident.

    DATA(ls_incident) = get_incident( iv_incident_no ).

    check_authorization(
    iv_reporter = ls_incident-reporter
    iv_assigned_to = ls_incident-assigned_to ).

    IF ls_incident-status = co_status_closed
      AND iv_status IS NOT INITIAL
      AND iv_status <> co_status_closed.
      RAISE EXCEPTION TYPE zcx_itsm_exception
        MESSAGE e005(zitsm).
    ENDIF.

    DATA(lv_old_status) = ls_incident-status.
    DATA(lv_old_assigned) = ls_incident-assigned_to.

    IF iv_priority IS NOT INITIAL.
      ls_incident-priority = iv_priority.
    ENDIF.
    IF iv_assigned_to IS NOT INITIAL.
      ls_incident-assigned_to = iv_assigned_to.
    ENDIF.
    IF iv_status IS NOT INITIAL.
      ls_incident-status = iv_status.
    ENDIF.
    IF iv_category IS NOT INITIAL.
      ls_incident-category = iv_category.
    ENDIF.
    IF iv_support_group IS NOT INITIAL.
      ls_incident-support_group = iv_support_group.
    ENDIF.
    IF iv_request_type IS NOT INITIAL.
      ls_incident-request_type = iv_request_type.
    ENDIF.
    IF iv_impact IS NOT INITIAL.
      ls_incident-impact = iv_impact.
    ENDIF.
    IF iv_resolution IS NOT INITIAL.
      ls_incident-resolution = iv_resolution.
    ENDIF.

    " An incident cannot be resolved without a resolution text
    IF ls_incident-status = co_status_resolved
       AND lv_old_status <> co_status_resolved
       AND ls_incident-resolution IS INITIAL.
      RAISE EXCEPTION TYPE zcx_itsm_exception
        MESSAGE e010(zitsm).
    ENDIF.

    IF ls_incident-status = co_status_closed
       AND lv_old_status <> co_status_closed.
      ls_incident-closed_on = sy-datum.
      ls_incident-closed_at = sy-uzeit.
    ENDIF.
    IF ls_incident-status <> lv_old_status.
      write_status_log(
      iv_incident_no = iv_incident_no
      iv_old_status = lv_old_status
      iv_new_status = ls_incident-status ).
    ENDIF.
    UPDATE zitsm_incident FROM ls_incident.

    IF ls_incident-assigned_to IS NOT INITIAL
      AND ls_incident-assigned_to <> lv_old_assigned.
      send_assignment_mail(
        iv_incident_no = iv_incident_no
        iv_assigned_to = ls_incident-assigned_to ).
    ENDIF.

  ENDMETHOD.

  METHOD validate_input.
    IF iv_title IS INITIAL.
      RAISE EXCEPTION TYPE zcx_itsm_exception
      MESSAGE e001(zitsm).
    ENDIF.
    IF iv_description IS INITIAL.
      RAISE EXCEPTION TYPE zcx_itsm_exception
      MESSAGE e002(zitsm).
    ENDIF.
    IF iv_priority IS INITIAL.
      RAISE EXCEPTION TYPE zcx_itsm_exception
      MESSAGE e003(zitsm).

    ENDIF.
  ENDMETHOD.

  METHOD write_status_log.
    DATA ls_log TYPE zitsm_inc_log.

    SELECT MAX( log_id )
      FROM zitsm_inc_log
      INTO @DATA(lv_max_id)
      WHERE incident_no = @iv_incident_no.

    ls_log-incident_no = iv_incident_no.
    ls_log-log_id = lv_max_id + 1.
    ls_log-old_status = iv_old_status.
    ls_log-new_status = iv_new_status.
    ls_log-changed_by = sy-uname.
    ls_log-change_date = sy-datum.
    ls_log-change_time = sy-uzeit.

    INSERT zitsm_inc_log FROM ls_log.
  ENDMETHOD.

ENDCLASS.
