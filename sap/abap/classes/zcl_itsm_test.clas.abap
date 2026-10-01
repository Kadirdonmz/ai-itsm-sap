CLASS zcl_itsm_test DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.

    TYPES: tt_test TYPE STANDARD TABLE OF zitsm_test WITH DEFAULT KEY.
    TYPES: tt_hist TYPE STANDARD TABLE OF zitsm_test_hist WITH DEFAULT KEY.

    "! Get all test steps of an incident
    CLASS-METHODS get_tests
      IMPORTING iv_incident_no  TYPE zitsm_test-incident_no
      RETURNING VALUE(rt_tests) TYPE tt_test.

    "! Create a new test step, returns the new test_id
    CLASS-METHODS create_test
      IMPORTING iv_incident_no     TYPE zitsm_test-incident_no
                iv_test_text       TYPE zitsm_test-test_text
                iv_test_type       TYPE zitsm_test-test_type OPTIONAL
                iv_is_critical     TYPE zitsm_test-is_critical OPTIONAL
                iv_req_id          TYPE zitsm_test-req_id OPTIONAL
                iv_expected_result TYPE zitsm_test-expected_result OPTIONAL
      RETURNING VALUE(rv_test_id)  TYPE zitsm_test-test_id.

    "! Record the execution result of a test step (writes history when it changes)
    CLASS-METHODS update_test
      IMPORTING iv_incident_no TYPE zitsm_test-incident_no
                iv_test_id     TYPE zitsm_test-test_id
                iv_test_result TYPE zitsm_test-test_result OPTIONAL
                iv_note        TYPE zitsm_test-note OPTIONAL.

    "! Update the definition of a test step (expert edit; writes history when it changes)
    CLASS-METHODS edit_test
      IMPORTING iv_incident_no     TYPE zitsm_test-incident_no
                iv_test_id         TYPE zitsm_test-test_id
                iv_test_text       TYPE zitsm_test-test_text
                iv_test_type       TYPE zitsm_test-test_type OPTIONAL
                iv_is_critical     TYPE zitsm_test-is_critical OPTIONAL
                iv_req_id          TYPE zitsm_test-req_id OPTIONAL
                iv_expected_result TYPE zitsm_test-expected_result OPTIONAL.

    "! Delete a test step (its history is kept for audit)
    CLASS-METHODS delete_test
      IMPORTING iv_incident_no TYPE zitsm_test-incident_no
                iv_test_id     TYPE zitsm_test-test_id.

    "! Full result/edit history of all tests of an incident (FR-20)
    CLASS-METHODS get_history
      IMPORTING iv_incident_no TYPE zitsm_test_hist-incident_no
      RETURNING VALUE(rt_hist) TYPE tt_hist.

  PROTECTED SECTION.
  PRIVATE SECTION.

    CLASS-METHODS write_history
      IMPORTING iv_incident_no TYPE zitsm_test_hist-incident_no
                iv_test_id     TYPE zitsm_test_hist-test_id
                iv_action      TYPE zitsm_test_hist-action
                iv_test_result TYPE zitsm_test_hist-test_result OPTIONAL
                iv_note        TYPE zitsm_test_hist-note OPTIONAL.
ENDCLASS.


CLASS zcl_itsm_test IMPLEMENTATION.

  METHOD create_test.
    " Find the highest test_id for this incident, add 1
    DATA lv_max TYPE i.

    SELECT MAX( test_id ) FROM zitsm_test INTO @DATA(lv_max_id)
      WHERE incident_no = @iv_incident_no.

    " Never reuse a deleted test's ID so its history stays separate
    SELECT MAX( test_id ) FROM zitsm_test_hist INTO @DATA(lv_max_hist)
      WHERE incident_no = @iv_incident_no.
    IF lv_max_hist > lv_max_id.
      lv_max_id = lv_max_hist.
    ENDIF.

    lv_max = lv_max_id.
    lv_max = lv_max + 1.
    rv_test_id = |{ lv_max WIDTH = 10 PAD = '0' ALIGN = RIGHT }|.

    DATA ls_test TYPE zitsm_test.
    ls_test-incident_no     = iv_incident_no.
    ls_test-test_id         = rv_test_id.
    ls_test-test_text       = iv_test_text.
    ls_test-test_type       = iv_test_type.
    ls_test-is_critical     = iv_is_critical.
    ls_test-req_id          = iv_req_id.
    ls_test-expected_result = iv_expected_result.
    ls_test-is_done         = ''.
    ls_test-test_result     = ''.
    ls_test-note            = ''.
    ls_test-done_by         = ''.
    ls_test-done_on         = '00000000'.

    INSERT zitsm_test FROM ls_test.
    IF sy-subrc <> 0.
      CLEAR rv_test_id.
    ENDIF.
  ENDMETHOD.

  METHOD delete_test.
    DELETE FROM zitsm_test
      WHERE incident_no = iv_incident_no
        AND test_id     = iv_test_id.

    IF sy-subrc = 0.
      write_history( iv_incident_no = iv_incident_no
                     iv_test_id     = iv_test_id
                     iv_action      = 'DELETE' ).
    ENDIF.
  ENDMETHOD.

  METHOD edit_test.
    SELECT SINGLE * FROM zitsm_test INTO @DATA(ls_test)
      WHERE incident_no = @iv_incident_no
        AND test_id     = @iv_test_id.

    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    " Only write history when the definition actually changed
    DATA(lv_changed) = xsdbool(
         ls_test-test_text       <> iv_test_text
      OR ls_test-test_type       <> iv_test_type
      OR ls_test-is_critical     <> iv_is_critical
      OR ls_test-req_id          <> iv_req_id
      OR ls_test-expected_result <> iv_expected_result ).

    IF lv_changed = abap_false.
      RETURN.
    ENDIF.

    ls_test-test_text       = iv_test_text.
    ls_test-test_type       = iv_test_type.
    ls_test-is_critical     = iv_is_critical.
    ls_test-req_id          = iv_req_id.
    ls_test-expected_result = iv_expected_result.

    UPDATE zitsm_test FROM ls_test.

    IF sy-subrc = 0.
      write_history( iv_incident_no = iv_incident_no
                     iv_test_id     = iv_test_id
                     iv_action      = 'EDIT'
                     iv_note        = CONV #( iv_test_text ) ).
    ENDIF.
  ENDMETHOD.

  METHOD get_history.
    SELECT * FROM zitsm_test_hist INTO TABLE @rt_hist
      WHERE incident_no = @iv_incident_no
      ORDER BY test_id, hist_no.
  ENDMETHOD.

  METHOD get_tests.
    SELECT * FROM zitsm_test INTO TABLE rt_tests
      WHERE incident_no = iv_incident_no
      ORDER BY test_id.
  ENDMETHOD.

  METHOD update_test.
    SELECT SINGLE * FROM zitsm_test INTO @DATA(ls_test)
      WHERE incident_no = @iv_incident_no
        AND test_id     = @iv_test_id.

    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    DATA(lv_old_result) = ls_test-test_result.
    DATA(lv_old_note)   = ls_test-note.

    " Nothing changed: keep executor/date and skip history
    IF iv_test_result = lv_old_result AND iv_note = lv_old_note.
      RETURN.
    ENDIF.

    ls_test-test_result = iv_test_result.
    ls_test-note        = iv_note.

    IF iv_test_result <> lv_old_result.
      IF iv_test_result IS NOT INITIAL.
        " New result: record who executed it and when
        ls_test-is_done = 'X'.
        ls_test-done_by = sy-uname.
        ls_test-done_on = sy-datum.
      ELSE.
        " Result cleared: reset execution info
        ls_test-is_done = ''.
        ls_test-done_by = ''.
        ls_test-done_on = '00000000'.
      ENDIF.
    ENDIF.

    UPDATE zitsm_test FROM ls_test.

    IF sy-subrc = 0.
      DATA lv_action TYPE zitsm_test_hist-action.
      IF iv_test_result IS INITIAL AND lv_old_result IS NOT INITIAL.
        lv_action = 'RESET'.   " e.g. after a revision or definition change
      ELSEIF iv_test_result <> lv_old_result.
        lv_action = 'RESULT'.
      ELSE.
        lv_action = 'NOTE'.   " only the note changed
      ENDIF.

      write_history( iv_incident_no = iv_incident_no
                     iv_test_id     = iv_test_id
                     iv_action      = lv_action
                     iv_test_result = iv_test_result
                     iv_note        = iv_note ).
    ENDIF.
  ENDMETHOD.

  METHOD write_history.
    SELECT MAX( hist_no ) FROM zitsm_test_hist INTO @DATA(lv_max)
      WHERE incident_no = @iv_incident_no
        AND test_id     = @iv_test_id.

    DATA ls_hist TYPE zitsm_test_hist.
    ls_hist-incident_no = iv_incident_no.
    ls_hist-test_id     = iv_test_id.
    ls_hist-hist_no     = lv_max + 1.
    ls_hist-action      = iv_action.
    ls_hist-test_result = iv_test_result.
    ls_hist-note        = iv_note.
    ls_hist-changed_by  = sy-uname.
    ls_hist-changed_on  = sy-datum.
    ls_hist-changed_at  = sy-uzeit.

    INSERT zitsm_test_hist FROM ls_hist.
  ENDMETHOD.

ENDCLASS.
