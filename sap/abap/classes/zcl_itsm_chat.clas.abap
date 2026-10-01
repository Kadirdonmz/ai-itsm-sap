CLASS zcl_itsm_chat DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.

    CLASS-METHODS create_conversation
      RETURNING
        VALUE(rv_conv_id) TYPE zitsm_conv-conv_id .
    CLASS-METHODS add_message
      IMPORTING
        !iv_conv_id      TYPE zitsm_msg-conv_id
        !iv_sender       TYPE zitsm_msg-sender
        !iv_text         TYPE zitsm_msg-msg_text
      RETURNING
        VALUE(rv_msg_no) TYPE zitsm_msg-msg_no .
    CLASS-METHODS get_messages
      IMPORTING
        !iv_conv_id        TYPE zitsm_msg-conv_id
      RETURNING
        VALUE(rt_messages) TYPE zitsm_tt_msg .
    CLASS-METHODS set_outcome
      IMPORTING
        !iv_conv_id     TYPE zitsm_conv-conv_id
        !iv_status      TYPE zitsm_conv-status
        !iv_incident_no TYPE zitsm_conv-incident_no OPTIONAL .
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_itsm_chat IMPLEMENTATION.

  METHOD add_message.
    " Only U (user) and A (AI assistant) are valid senders
    IF iv_sender <> 'U' AND iv_sender <> 'A'.
      RETURN.
    ENDIF.

    " Find the highest msg_no in this conversation, add 1
    DATA lv_max TYPE i.

    SELECT MAX( msg_no ) FROM zitsm_msg INTO @DATA(lv_max_no)
      WHERE conv_id = @iv_conv_id.

    lv_max = lv_max_no.
    lv_max = lv_max + 1.
    rv_msg_no = lv_max.

    DATA ls_msg TYPE zitsm_msg.
    ls_msg-conv_id    = iv_conv_id.
    ls_msg-msg_no     = rv_msg_no.
    ls_msg-sender     = iv_sender.
    ls_msg-msg_text   = iv_text.
    ls_msg-created_on = sy-datum.
    ls_msg-created_at = sy-uzeit.

    INSERT zitsm_msg FROM ls_msg.
    IF sy-subrc <> 0.
      CLEAR rv_msg_no.
    ENDIF.
  ENDMETHOD.

  METHOD create_conversation.
    " Find the highest conv_id, add 1
    DATA lv_max TYPE i.

    SELECT MAX( conv_id ) FROM zitsm_conv INTO @DATA(lv_max_id).

    lv_max = lv_max_id.
    lv_max = lv_max + 1.
    rv_conv_id = |{ lv_max WIDTH = 10 PAD = '0' ALIGN = RIGHT }|.

    DATA ls_conv TYPE zitsm_conv.
    ls_conv-conv_id    = rv_conv_id.
    ls_conv-username   = sy-uname.
    ls_conv-status     = 'O'.
    ls_conv-created_on = sy-datum.
    ls_conv-created_at = sy-uzeit.

    INSERT zitsm_conv FROM ls_conv.

    IF sy-subrc <> 0.
      CLEAR rv_conv_id.
    ENDIF.
  ENDMETHOD.

  METHOD get_messages.
    SELECT * FROM zitsm_msg INTO TABLE rt_messages
      WHERE conv_id = iv_conv_id
      ORDER BY msg_no.
  ENDMETHOD.

  METHOD set_outcome.
    " Only R (resolved by AI) and T (turned into ticket) are valid outcomes
    IF iv_status <> 'R' AND iv_status <> 'T'.
      RETURN.
    ENDIF.

    UPDATE zitsm_conv
      SET status      = @iv_status,
          incident_no = @iv_incident_no
      WHERE conv_id = @iv_conv_id.
  ENDMETHOD.

ENDCLASS.
