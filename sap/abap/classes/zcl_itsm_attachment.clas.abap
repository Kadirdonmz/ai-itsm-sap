CLASS zcl_itsm_attachment DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES tt_attachment TYPE STANDARD TABLE OF zitsm_attach WITH DEFAULT KEY.

    CLASS-METHODS get_attachments
      IMPORTING iv_incident_no        TYPE zitsm_attach-incident_no
      RETURNING VALUE(rt_attachments) TYPE tt_attachment.

    "! If iv_test_id is set, the file is stored as evidence for that test step (FR-16)
    CLASS-METHODS create_attachment
      IMPORTING iv_incident_no      TYPE zitsm_attach-incident_no
                iv_filename         TYPE zitsm_attach-filename
                iv_mimetype         TYPE zitsm_attach-mimetype
                iv_content          TYPE string
                iv_test_id          TYPE zitsm_attach-test_id OPTIONAL
      RETURNING VALUE(rv_attach_id) TYPE zitsm_attach-attach_id
      RAISING   zcx_itsm_exception.

    CLASS-METHODS delete_attachment
      IMPORTING iv_incident_no TYPE zitsm_attach-incident_no
                iv_attach_id   TYPE zitsm_attach-attach_id
      RAISING   zcx_itsm_exception.


  PRIVATE SECTION.
    CONSTANTS c_max_size TYPE i VALUE 8000000.   " ~8 MB

    CLASS-METHODS check_authorization
      IMPORTING iv_incident_no TYPE zitsm_attach-incident_no
      RAISING   zcx_itsm_exception.
ENDCLASS.


CLASS zcl_itsm_attachment IMPLEMENTATION.

  METHOD check_authorization.
    DATA(ls_incident) = zcl_itsm_incident=>get_incident( iv_incident_no ).

    IF sy-uname <> ls_incident-reporter AND sy-uname <> ls_incident-assigned_to.
      RAISE EXCEPTION TYPE zcx_itsm_exception MESSAGE e006(zitsm).
    ENDIF.
  ENDMETHOD.

  METHOD create_attachment.
    check_authorization( iv_incident_no ).

    DATA(lv_size) = strlen( iv_content ) * 3 / 4.

    IF lv_size > c_max_size.
      RAISE EXCEPTION TYPE zcx_itsm_exception MESSAGE e007(zitsm).
    ENDIF.

    DATA lv_max  TYPE zitsm_attach-attach_id.
    DATA lv_next TYPE i.

    SELECT MAX( attach_id ) FROM zitsm_attach
      INTO lv_max
      WHERE incident_no = iv_incident_no.

    IF lv_max IS INITIAL.
      lv_next = 1.
    ELSE.
      lv_next = lv_max + 1.
    ENDIF.

    rv_attach_id = |{ lv_next WIDTH = 10 PAD = '0' ALIGN = RIGHT }|.

    DATA ls_attach TYPE zitsm_attach.
    ls_attach-incident_no = iv_incident_no.
    ls_attach-attach_id   = rv_attach_id.
    ls_attach-filename    = iv_filename.
    ls_attach-mimetype    = iv_mimetype.
    ls_attach-filesize    = lv_size.
    ls_attach-content     = iv_content.
    ls_attach-test_id     = iv_test_id.
    ls_attach-uploaded_by = sy-uname.
    ls_attach-uploaded_on = sy-datum.

    INSERT zitsm_attach FROM ls_attach.

    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_itsm_exception
        MESSAGE e009(zitsm) WITH iv_incident_no.
    ENDIF.
  ENDMETHOD.

  METHOD delete_attachment.
    check_authorization( iv_incident_no ).

    DELETE FROM zitsm_attach
      WHERE incident_no = iv_incident_no
        AND attach_id   = iv_attach_id.
  ENDMETHOD.

  METHOD get_attachments.
    SELECT * FROM zitsm_attach
      INTO TABLE rt_attachments
      WHERE incident_no = iv_incident_no.
  ENDMETHOD.

ENDCLASS.
