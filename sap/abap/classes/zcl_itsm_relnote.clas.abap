CLASS zcl_itsm_relnote DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.

    CLASS-METHODS get_note
      IMPORTING
        !iv_incident_no TYPE zitsm_relnote-incident_no
      RETURNING
        VALUE(rs_note)  TYPE zitsm_relnote .
    CLASS-METHODS save_note
      IMPORTING
        !iv_incident_no TYPE zitsm_relnote-incident_no
        !iv_note_text   TYPE zitsm_relnote-note_text
        !iv_decision    TYPE zitsm_relnote-decision OPTIONAL
        !iv_model_name  TYPE zitsm_relnote-model_name OPTIONAL
      RETURNING
        VALUE(rv_ok)    TYPE abap_bool .
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_itsm_relnote IMPLEMENTATION.

  METHOD get_note.
    SELECT SINGLE * FROM zitsm_relnote INTO rs_note
      WHERE incident_no = iv_incident_no.
  ENDMETHOD.

  METHOD save_note.
    DATA ls_note TYPE zitsm_relnote.

    ls_note-incident_no = iv_incident_no.
    ls_note-note_text   = iv_note_text.
    ls_note-decision    = iv_decision.
    ls_note-model_name  = iv_model_name.
    ls_note-approved_by = sy-uname.
    ls_note-approved_on = sy-datum.
    ls_note-approved_at = sy-uzeit.

    " One note per incident: MODIFY inserts or updates
    MODIFY zitsm_relnote FROM ls_note.

    IF sy-subrc = 0.
      rv_ok = abap_true.
    ELSE.
      rv_ok = abap_false.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
