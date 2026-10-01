CLASS zcl_itsm_aisug DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.

    CLASS-METHODS create_suggestion
      IMPORTING
        !iv_incident_no   TYPE zitsm_aisug-incident_no
        !iv_sug_type      TYPE zitsm_aisug-sug_type
        !iv_sug_value     TYPE zitsm_aisug-sug_value
        !iv_reason        TYPE zitsm_aisug-reason OPTIONAL
        !iv_source_ref    TYPE zitsm_aisug-source_ref OPTIONAL
        !iv_model_name    TYPE zitsm_aisug-model_name OPTIONAL
        !iv_decision      TYPE zitsm_aisug-decision OPTIONAL
        !iv_final_value   TYPE zitsm_aisug-final_value OPTIONAL
        !iv_user_feedback TYPE zitsm_aisug-user_feedback OPTIONAL
      RETURNING
        VALUE(rv_sug_id)  TYPE zitsm_aisug-sug_id .
    CLASS-METHODS update_decision
      IMPORTING
        !iv_incident_no   TYPE zitsm_aisug-incident_no
        !iv_sug_id        TYPE zitsm_aisug-sug_id
        !iv_decision      TYPE zitsm_aisug-decision
        !iv_final_value   TYPE zitsm_aisug-final_value OPTIONAL
        !iv_user_feedback TYPE zitsm_aisug-user_feedback OPTIONAL .
    CLASS-METHODS get_suggestions
      IMPORTING
        !iv_incident_no       TYPE zitsm_aisug-incident_no
      RETURNING
        VALUE(rt_suggestions) TYPE zitsm_tt_aisug .
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_itsm_aisug IMPLEMENTATION.

  METHOD create_suggestion.
    " Find the highest sug_id for this incident, add 1
    DATA lv_max TYPE i.

    SELECT MAX( sug_id ) FROM zitsm_aisug INTO @DATA(lv_max_id)
      WHERE incident_no = @iv_incident_no.

    lv_max = lv_max_id.
    lv_max = lv_max + 1.
    rv_sug_id = |{ lv_max WIDTH = 10 PAD = '0' ALIGN = RIGHT }|.

    DATA ls_sug TYPE zitsm_aisug.
    ls_sug-incident_no   = iv_incident_no.
    ls_sug-sug_id        = rv_sug_id.
    ls_sug-sug_type      = iv_sug_type.
    ls_sug-sug_value     = iv_sug_value.
    ls_sug-reason        = iv_reason.
    ls_sug-source_ref    = iv_source_ref.
    ls_sug-model_name    = iv_model_name.
    ls_sug-decision      = iv_decision.
    ls_sug-final_value   = iv_final_value.
    ls_sug-user_feedback = iv_user_feedback.
    ls_sug-created_by    = sy-uname.
    ls_sug-created_on    = sy-datum.
    ls_sug-created_at    = sy-uzeit.

    INSERT zitsm_aisug FROM ls_sug.

    IF sy-subrc <> 0.
      CLEAR rv_sug_id.
    ENDIF.
  ENDMETHOD.

  METHOD get_suggestions.
    SELECT * FROM zitsm_aisug INTO TABLE rt_suggestions
      WHERE incident_no = iv_incident_no
      ORDER BY sug_id.
  ENDMETHOD.

  METHOD update_decision.
    " Only A (accepted), M (modified), R (rejected) are valid decisions
    IF iv_decision <> 'A' AND iv_decision <> 'M' AND iv_decision <> 'R'.
      RETURN.
    ENDIF.

    UPDATE zitsm_aisug
      SET decision      = @iv_decision,
          final_value   = @iv_final_value,
          user_feedback = @iv_user_feedback
      WHERE incident_no = @iv_incident_no
        AND sug_id      = @iv_sug_id.
  ENDMETHOD.

ENDCLASS.
