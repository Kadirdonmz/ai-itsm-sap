CLASS zcl_itsm_req DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.

    TYPES:
      tt_req TYPE STANDARD TABLE OF zitsm_req WITH DEFAULT KEY .

    "! Get all requirements of an incident
    CLASS-METHODS get_requirements
      IMPORTING
        !iv_incident_no TYPE zitsm_req-incident_no
      RETURNING
        VALUE(rt_reqs)  TYPE tt_req .
    "! Create a new requirement, returns the new req_id
    CLASS-METHODS create_requirement
      IMPORTING
        !iv_incident_no  TYPE zitsm_req-incident_no
        !iv_req_text     TYPE zitsm_req-req_text
        !iv_req_type     TYPE zitsm_req-req_type OPTIONAL
        !iv_source_ref   TYPE zitsm_req-source_ref OPTIONAL
      RETURNING
        VALUE(rv_req_id) TYPE zitsm_req-req_id .
    "! Update an existing requirement's text/type
    CLASS-METHODS update_requirement
      IMPORTING
        !iv_incident_no TYPE zitsm_req-incident_no
        !iv_req_id      TYPE zitsm_req-req_id
        !iv_req_text    TYPE zitsm_req-req_text
        !iv_req_type    TYPE zitsm_req-req_type OPTIONAL .
    "! Delete a requirement
    CLASS-METHODS delete_requirement
      IMPORTING
        !iv_incident_no TYPE zitsm_req-incident_no
        !iv_req_id      TYPE zitsm_req-req_id .
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_itsm_req IMPLEMENTATION.

  METHOD create_requirement.
    " Find the highest req_id for this incident, add 1
    DATA lv_max TYPE i.

    SELECT MAX( req_id ) FROM zitsm_req INTO @DATA(lv_max_id)
      WHERE incident_no = @iv_incident_no.

    lv_max = lv_max_id.
    lv_max = lv_max + 1.
    rv_req_id = |{ lv_max WIDTH = 10 PAD = '0' ALIGN = RIGHT }|.

    DATA ls_req TYPE zitsm_req.
    ls_req-incident_no = iv_incident_no.
    ls_req-req_id      = rv_req_id.
    ls_req-req_text    = iv_req_text.
    ls_req-req_type    = iv_req_type.
    ls_req-source_ref  = iv_source_ref.
    ls_req-created_by  = sy-uname.
    ls_req-created_on  = sy-datum.

    INSERT zitsm_req FROM ls_req.
    IF sy-subrc <> 0.
      CLEAR rv_req_id.
    ENDIF.
  ENDMETHOD.

  METHOD delete_requirement.
    DELETE FROM zitsm_req
      WHERE incident_no = iv_incident_no
        AND req_id      = iv_req_id.
  ENDMETHOD.

  METHOD get_requirements.
    SELECT * FROM zitsm_req INTO TABLE rt_reqs
      WHERE incident_no = iv_incident_no
      ORDER BY req_id.
  ENDMETHOD.

  METHOD update_requirement.
    SELECT SINGLE * FROM zitsm_req INTO @DATA(ls_req)
      WHERE incident_no = @iv_incident_no
        AND req_id      = @iv_req_id.

    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    ls_req-req_text = iv_req_text.
    IF iv_req_type IS NOT INITIAL.
      ls_req-req_type = iv_req_type.
    ENDIF.

    UPDATE zitsm_req FROM ls_req.
  ENDMETHOD.

ENDCLASS.
