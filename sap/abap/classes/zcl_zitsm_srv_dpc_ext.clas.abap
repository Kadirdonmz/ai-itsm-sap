CLASS zcl_zitsm_srv_dpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zitsm_srv_dpc
  CREATE PUBLIC .

  PUBLIC SECTION.
  PROTECTED SECTION.

    METHODS attachmentset_create_entity
        REDEFINITION .
    METHODS attachmentset_delete_entity
        REDEFINITION .
    METHODS attachmentset_get_entity
        REDEFINITION .
    METHODS attachmentset_get_entityset
        REDEFINITION .
    METHODS categoryset_get_entityset
        REDEFINITION .
    METHODS conversationset_create_entity
        REDEFINITION .
    METHODS conversationset_get_entity
        REDEFINITION .
    METHODS conversationset_get_entityset
        REDEFINITION .
    METHODS conversationset_update_entity
        REDEFINITION .
    METHODS expertset_get_entityset
        REDEFINITION .
    METHODS incidentlogset_get_entityset
        REDEFINITION .
    METHODS incidentset_create_entity
        REDEFINITION .
    METHODS incidentset_get_entity
        REDEFINITION .
    METHODS incidentset_get_entityset
        REDEFINITION .
    METHODS incidentset_update_entity
        REDEFINITION .
    METHODS knowledgearticle_create_entity
        REDEFINITION .
    METHODS knowledgearticle_delete_entity
        REDEFINITION .
    METHODS knowledgearticle_get_entity
        REDEFINITION .
    METHODS knowledgearticle_get_entityset
        REDEFINITION .
    METHODS knowledgearticle_update_entity
        REDEFINITION .
    METHODS messageset_create_entity
        REDEFINITION .
    METHODS messageset_get_entityset
        REDEFINITION .
    METHODS releasenoteset_create_entity
        REDEFINITION .
    METHODS releasenoteset_get_entity
        REDEFINITION .
    METHODS releasenoteset_update_entity
        REDEFINITION .
    METHODS requirementset_create_entity
        REDEFINITION .
    METHODS requirementset_delete_entity
        REDEFINITION .
    METHODS requirementset_get_entity
        REDEFINITION .
    METHODS requirementset_get_entityset
        REDEFINITION .
    METHODS requirementset_update_entity
        REDEFINITION .
    METHODS suggestionset_create_entity
        REDEFINITION .
    METHODS suggestionset_get_entityset
        REDEFINITION .
    METHODS suggestionset_update_entity
        REDEFINITION .
    METHODS testhistoryset_get_entityset
        REDEFINITION .
    METHODS testset_create_entity
        REDEFINITION .
    METHODS testset_delete_entity
        REDEFINITION .
    METHODS testset_get_entity
        REDEFINITION .
    METHODS testset_get_entityset
        REDEFINITION .
    METHODS testset_update_entity
        REDEFINITION .
  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_zitsm_srv_dpc_ext IMPLEMENTATION.

  METHOD attachmentset_create_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    TRY.
        DATA(lv_attach_id) = zcl_itsm_attachment=>create_attachment(
          iv_incident_no = CONV #( ls_entity-incidentno )
          iv_filename    = ls_entity-filename
          iv_mimetype    = ls_entity-mimetype
          iv_content     = ls_entity-content
          iv_test_id     = ls_entity-testid ).
      CATCH zcx_itsm_exception INTO DATA(lx_error).
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING
            message_unlimited = lx_error->get_text( ).
    ENDTRY.

    er_entity-incidentno = ls_entity-incidentno.
    er_entity-attachid   = lv_attach_id.
    er_entity-filename   = ls_entity-filename.
    er_entity-mimetype   = ls_entity-mimetype.
    er_entity-testid     = ls_entity-testid.
  ENDMETHOD.

  METHOD attachmentset_delete_entity.
    DATA lv_incident_no TYPE zitsm_attach-incident_no.
    DATA lv_attach_id   TYPE zitsm_attach-attach_id.

    LOOP AT it_key_tab INTO DATA(ls_key).
      CASE ls_key-name.
        WHEN 'IncidentNo'.
          lv_incident_no = ls_key-value.
        WHEN 'AttachId'.
          lv_attach_id = ls_key-value.
      ENDCASE.
    ENDLOOP.

    TRY.
        zcl_itsm_attachment=>delete_attachment(
          iv_incident_no = CONV #( lv_incident_no )
          iv_attach_id   = lv_attach_id ).
      CATCH zcx_itsm_exception INTO DATA(lx_error).
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING
            message_unlimited = lx_error->get_text( ).
    ENDTRY.
  ENDMETHOD.

  METHOD attachmentset_get_entity.
    DATA lv_incident_no TYPE zitsm_attach-incident_no.
    DATA lv_attach_id   TYPE zitsm_attach-attach_id.

    LOOP AT it_key_tab INTO DATA(ls_key).
      CASE ls_key-name.
        WHEN 'IncidentNo'.
          lv_incident_no = ls_key-value.
        WHEN 'AttachId'.
          lv_attach_id = ls_key-value.
      ENDCASE.
    ENDLOOP.

    SELECT SINGLE * FROM zitsm_attach INTO @DATA(ls_att)
      WHERE incident_no = @lv_incident_no
        AND attach_id   = @lv_attach_id.

    IF sy-subrc = 0.
      er_entity-incidentno = ls_att-incident_no.
      er_entity-attachid   = ls_att-attach_id.
      er_entity-filename   = ls_att-filename.
      er_entity-mimetype   = ls_att-mimetype.
      er_entity-filesize   = ls_att-filesize.
      er_entity-content    = ls_att-content.
      er_entity-uploadedby = ls_att-uploaded_by.
      er_entity-uploadedon = ls_att-uploaded_on.
      er_entity-testid     = ls_att-test_id.
    ENDIF.
  ENDMETHOD.

  METHOD attachmentset_get_entityset.
    DATA lv_incident_no TYPE zitsm_attach-incident_no.

    READ TABLE it_key_tab INTO DATA(ls_key) WITH KEY name = 'IncidentNo'.
    IF sy-subrc = 0.
      lv_incident_no = ls_key-value.
    ELSE.
      LOOP AT it_filter_select_options INTO DATA(ls_filter).
        IF ls_filter-property = 'IncidentNo'.
          READ TABLE ls_filter-select_options INTO DATA(ls_so) INDEX 1.
          IF sy-subrc = 0.
            lv_incident_no = ls_so-low.
          ENDIF.
        ENDIF.
      ENDLOOP.
    ENDIF.

    DATA(lt_att) = zcl_itsm_attachment=>get_attachments( CONV #( lv_incident_no ) ).

    LOOP AT lt_att INTO DATA(ls_att).
      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-incidentno = ls_att-incident_no.
      <fs>-attachid   = ls_att-attach_id.
      <fs>-filename   = ls_att-filename.
      <fs>-mimetype   = ls_att-mimetype.
      <fs>-filesize   = ls_att-filesize.
      <fs>-uploadedby = ls_att-uploaded_by.
      <fs>-uploadedon = ls_att-uploaded_on.
      <fs>-testid     = ls_att-test_id.
    ENDLOOP.
  ENDMETHOD.

  METHOD categoryset_get_entityset.
    DATA(lt_cat) = zcl_itsm_category=>get_categories( ).

    LOOP AT lt_cat INTO DATA(ls_cat).
      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-categoryname = ls_cat-category.
      <fs>-supportgroup = ls_cat-support_group.
      <fs>-isactive     = ls_cat-is_active.
    ENDLOOP.
  ENDMETHOD.

  METHOD conversationset_create_entity.
    DATA(lv_conv_id) = zcl_itsm_chat=>create_conversation( ).

    IF lv_conv_id IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_unlimited = 'Sohbet başlatılamadı.'.
    ENDIF.

    er_entity-convid    = lv_conv_id.
    er_entity-username  = sy-uname.
    er_entity-status    = 'O'.
    er_entity-createdon = sy-datum.
    er_entity-createdat = sy-uzeit.
  ENDMETHOD.

  METHOD conversationset_get_entity.
    READ TABLE it_key_tab INTO DATA(ls_key) INDEX 1.
    DATA(lv_conv_id) = ls_key-value.

    SELECT SINGLE * FROM zitsm_conv INTO @DATA(ls_conv)
      WHERE conv_id = @lv_conv_id.

    IF sy-subrc = 0.
      er_entity-convid     = ls_conv-conv_id.
      er_entity-username   = ls_conv-username.
      er_entity-incidentno = ls_conv-incident_no.
      er_entity-status     = ls_conv-status.
      er_entity-createdon  = ls_conv-created_on.
      er_entity-createdat  = ls_conv-created_at.
    ENDIF.
  ENDMETHOD.

  METHOD conversationset_get_entityset.
    SELECT * FROM zitsm_conv INTO TABLE @DATA(lt_conv)
      WHERE username = @sy-uname
      ORDER BY conv_id DESCENDING.

    LOOP AT lt_conv INTO DATA(ls_conv).
      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-convid     = ls_conv-conv_id.
      <fs>-username   = ls_conv-username.
      <fs>-incidentno = ls_conv-incident_no.
      <fs>-status     = ls_conv-status.
      <fs>-createdon  = ls_conv-created_on.
      <fs>-createdat  = ls_conv-created_at.
    ENDLOOP.
  ENDMETHOD.

  METHOD conversationset_update_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    READ TABLE it_key_tab INTO DATA(ls_key) INDEX 1.
    DATA(lv_conv_id) = ls_key-value.

    zcl_itsm_chat=>set_outcome(
      iv_conv_id     = CONV #( lv_conv_id )
      iv_status      = ls_entity-status
      iv_incident_no = CONV #( ls_entity-incidentno ) ).

    SELECT SINGLE * FROM zitsm_conv INTO @DATA(ls_conv)
      WHERE conv_id = @lv_conv_id.

    IF sy-subrc = 0.
      er_entity-convid     = ls_conv-conv_id.
      er_entity-username   = ls_conv-username.
      er_entity-incidentno = ls_conv-incident_no.
      er_entity-status     = ls_conv-status.
      er_entity-createdon  = ls_conv-created_on.
      er_entity-createdat  = ls_conv-created_at.
    ENDIF.
  ENDMETHOD.

  METHOD expertset_get_entityset.
    DATA lv_expertise TYPE zitsm_expert-expertise.

    LOOP AT it_filter_select_options INTO DATA(ls_filter).
      IF ls_filter-property = 'Expertise'.
        READ TABLE ls_filter-select_options INTO DATA(ls_so) INDEX 1.
        IF sy-subrc = 0.
          lv_expertise = ls_so-low.
        ENDIF.
      ENDIF.
    ENDLOOP.

    SELECT * FROM zitsm_expert INTO TABLE @DATA(lt_data).

    LOOP AT lt_data INTO DATA(ls_data).
      IF lv_expertise IS NOT INITIAL AND
         to_upper( ls_data-expertise ) <> to_upper( lv_expertise ).
        CONTINUE.
      ENDIF.

      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-expertise = ls_data-expertise.
      <fs>-username  = ls_data-username.
      <fs>-fullname  = ls_data-fullname.
      <fs>-email     = ls_data-email.
    ENDLOOP.
  ENDMETHOD.

  METHOD incidentlogset_get_entityset.
    DATA lv_incident_no TYPE zitsm_inc_log-incident_no.

    LOOP AT it_filter_select_options INTO DATA(ls_filter).
      IF ls_filter-property = 'IncidentNo'.
        READ TABLE ls_filter-select_options INTO DATA(ls_so) INDEX 1.
        IF sy-subrc = 0.
          lv_incident_no = ls_so-low.
        ENDIF.
      ENDIF.
    ENDLOOP.

    DATA lt_log TYPE STANDARD TABLE OF zitsm_inc_log.

    IF lv_incident_no IS NOT INITIAL.
      SELECT * FROM zitsm_inc_log INTO TABLE lt_log
        WHERE incident_no = lv_incident_no.
    ELSE.
      SELECT * FROM zitsm_inc_log INTO TABLE lt_log.
    ENDIF.

    LOOP AT lt_log INTO DATA(ls_log).
      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-logid      = ls_log-log_id.
      <fs>-incidentno = ls_log-incident_no.
      <fs>-oldstatus  = ls_log-old_status.
      <fs>-newstatus  = ls_log-new_status.
      <fs>-changedby  = ls_log-changed_by.
      <fs>-changedate = ls_log-change_date.
      <fs>-changetime = ls_log-change_time.
    ENDLOOP.
  ENDMETHOD.

  METHOD incidentset_create_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    TRY.
        DATA(lv_new_no) = zcl_itsm_incident=>create_incident(
          iv_title         = ls_entity-title
          iv_description   = ls_entity-description
          iv_priority      = ls_entity-priority
          iv_assigned_to   = ls_entity-assignedto
          iv_category      = ls_entity-category
          iv_support_group = ls_entity-supportgroup
          iv_request_type  = ls_entity-requesttype
          iv_impact        = ls_entity-impact ).

        DATA(ls_created) = zcl_itsm_incident=>get_incident( lv_new_no ).
      CATCH zcx_itsm_exception INTO DATA(lx_error).
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING
            message_unlimited = lx_error->get_text( ).
    ENDTRY.

    MOVE-CORRESPONDING ls_created TO er_entity.
    er_entity-incidentno   = ls_created-incident_no.
    er_entity-assignedto   = ls_created-assigned_to.
    er_entity-createdon    = ls_created-created_on.
    er_entity-createdat    = ls_created-created_at.
    er_entity-closedon     = ls_created-closed_on.
    er_entity-closedat     = ls_created-closed_at.
    er_entity-supportgroup = ls_created-support_group.
    er_entity-requesttype  = ls_created-request_type.
  ENDMETHOD.

  METHOD incidentset_get_entity.
    DATA lv_incident_no TYPE zitsm_incident-incident_no.

    READ TABLE it_key_tab INTO DATA(ls_key) INDEX 1.
    lv_incident_no = ls_key-value.

    TRY.
        DATA(ls_data) = zcl_itsm_incident=>get_incident( CONV #( lv_incident_no ) ).
      CATCH zcx_itsm_exception INTO DATA(lx_error).
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING
            message_unlimited = lx_error->get_text( ).
    ENDTRY.

    MOVE-CORRESPONDING ls_data TO er_entity.
    er_entity-incidentno   = ls_data-incident_no.
    er_entity-assignedto   = ls_data-assigned_to.
    er_entity-createdon    = ls_data-created_on.
    er_entity-createdat    = ls_data-created_at.
    er_entity-closedon     = ls_data-closed_on.
    er_entity-closedat     = ls_data-closed_at.
    er_entity-supportgroup = ls_data-support_group.
    er_entity-requesttype  = ls_data-request_type.
  ENDMETHOD.

  METHOD incidentset_get_entityset.
    DATA(lt_data) = zcl_itsm_incident=>get_incident_list( ).

    LOOP AT lt_data INTO DATA(ls_data).
      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      MOVE-CORRESPONDING ls_data TO <fs>.
      <fs>-incidentno   = ls_data-incident_no.
      <fs>-assignedto   = ls_data-assigned_to.
      <fs>-createdon    = ls_data-created_on.
      <fs>-createdat    = ls_data-created_at.
      <fs>-closedon     = ls_data-closed_on.
      <fs>-closedat     = ls_data-closed_at.
      <fs>-supportgroup = ls_data-support_group.
      <fs>-requesttype  = ls_data-request_type.
    ENDLOOP.
  ENDMETHOD.

  METHOD incidentset_update_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    READ TABLE it_key_tab INTO DATA(ls_key) INDEX 1.
    DATA(lv_incident_no) = ls_key-value.

    TRY.
        zcl_itsm_incident=>update_incident(
          iv_incident_no   = CONV #( lv_incident_no )
          iv_priority      = ls_entity-priority
          iv_status        = ls_entity-status
          iv_assigned_to   = ls_entity-assignedto
          iv_category      = ls_entity-category
          iv_support_group = ls_entity-supportgroup
          iv_request_type  = ls_entity-requesttype
          iv_impact        = ls_entity-impact
          iv_resolution    = ls_entity-resolution ).
      CATCH zcx_itsm_exception INTO DATA(lx_error).
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING
            message_unlimited = lx_error->get_text( ).
    ENDTRY.

    MOVE-CORRESPONDING ls_entity TO er_entity.
    er_entity-incidentno = lv_incident_no.
  ENDMETHOD.

  METHOD knowledgearticle_create_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    DATA(lv_kb_id) = zcl_itsm_kb=>create_article(
      iv_title       = ls_entity-title
      iv_problem     = ls_entity-problem
      iv_cause       = ls_entity-cause
      iv_solution    = ls_entity-solution
      iv_check_steps = ls_entity-checksteps
      iv_tags        = ls_entity-tags
      iv_source_inc  = CONV #( ls_entity-sourceinc ) ).

    er_entity            = ls_entity.
    er_entity-kbid       = lv_kb_id.
    er_entity-createdby  = sy-uname.
    er_entity-createdon  = sy-datum.
  ENDMETHOD.

  METHOD knowledgearticle_delete_entity.
    READ TABLE it_key_tab INTO DATA(ls_key) WITH KEY name = 'KbId'.
    IF sy-subrc <> 0.
      READ TABLE it_key_tab INTO ls_key INDEX 1.
    ENDIF.

    zcl_itsm_kb=>delete_article( CONV #( ls_key-value ) ).
  ENDMETHOD.

  METHOD knowledgearticle_get_entity.
    READ TABLE it_key_tab INTO DATA(ls_key) INDEX 1.
    DATA(lv_kb_id) = ls_key-value.

    DATA(ls_kb) = zcl_itsm_kb=>get_article( CONV #( lv_kb_id ) ).

    IF ls_kb-kb_id IS NOT INITIAL.
      er_entity-kbid       = ls_kb-kb_id.
      er_entity-title      = ls_kb-title.
      er_entity-problem    = ls_kb-problem.
      er_entity-cause      = ls_kb-cause.
      er_entity-solution   = ls_kb-solution.
      er_entity-checksteps = ls_kb-check_steps.
      er_entity-tags       = ls_kb-tags.
      er_entity-sourceinc  = ls_kb-source_inc.
      er_entity-createdby  = ls_kb-created_by.
      er_entity-createdon  = ls_kb-created_on.
    ENDIF.
  ENDMETHOD.

  METHOD knowledgearticle_get_entityset.
    DATA(lt_kb) = zcl_itsm_kb=>get_articles( ).

    LOOP AT lt_kb INTO DATA(ls_kb).
      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-kbid       = ls_kb-kb_id.
      <fs>-title      = ls_kb-title.
      <fs>-problem    = ls_kb-problem.
      <fs>-cause      = ls_kb-cause.
      <fs>-solution   = ls_kb-solution.
      <fs>-checksteps = ls_kb-check_steps.
      <fs>-tags       = ls_kb-tags.
      <fs>-sourceinc  = ls_kb-source_inc.
      <fs>-createdby  = ls_kb-created_by.
      <fs>-createdon  = ls_kb-created_on.
    ENDLOOP.
  ENDMETHOD.

  METHOD knowledgearticle_update_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    READ TABLE it_key_tab INTO DATA(ls_key) INDEX 1.
    DATA(lv_kb_id) = ls_key-value.

    zcl_itsm_kb=>update_article(
      iv_kb_id       = CONV #( lv_kb_id )
      iv_title       = ls_entity-title
      iv_problem     = ls_entity-problem
      iv_cause       = ls_entity-cause
      iv_solution    = ls_entity-solution
      iv_check_steps = ls_entity-checksteps
      iv_tags        = ls_entity-tags ).

    er_entity      = ls_entity.
    er_entity-kbid = lv_kb_id.
  ENDMETHOD.

  METHOD messageset_create_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    DATA(lv_msg_no) = zcl_itsm_chat=>add_message(
      iv_conv_id = CONV #( ls_entity-convid )
      iv_sender  = ls_entity-sender
      iv_text    = ls_entity-msgtext ).

    IF lv_msg_no IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_unlimited = 'Mesaj kaydedilemedi.'.
    ENDIF.

    er_entity-convid    = ls_entity-convid.
    er_entity-msgno     = lv_msg_no.
    er_entity-sender    = ls_entity-sender.
    er_entity-msgtext   = ls_entity-msgtext.
    er_entity-createdon = sy-datum.
    er_entity-createdat = sy-uzeit.
  ENDMETHOD.

  METHOD messageset_get_entityset.
    DATA lv_conv_id TYPE zitsm_msg-conv_id.

    READ TABLE it_key_tab INTO DATA(ls_key) WITH KEY name = 'ConvId'.
    IF sy-subrc = 0.
      lv_conv_id = ls_key-value.
    ELSE.
      LOOP AT it_filter_select_options INTO DATA(ls_filter).
        IF ls_filter-property = 'ConvId'.
          READ TABLE ls_filter-select_options INTO DATA(ls_so) INDEX 1.
          IF sy-subrc = 0.
            lv_conv_id = ls_so-low.
          ENDIF.
        ENDIF.
      ENDLOOP.
    ENDIF.

    DATA(lt_msg) = zcl_itsm_chat=>get_messages( CONV #( lv_conv_id ) ).

    LOOP AT lt_msg INTO DATA(ls_msg).
      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-convid    = ls_msg-conv_id.
      <fs>-msgno     = ls_msg-msg_no.
      <fs>-sender    = ls_msg-sender.
      <fs>-msgtext   = ls_msg-msg_text.
      <fs>-createdon = ls_msg-created_on.
      <fs>-createdat = ls_msg-created_at.
    ENDLOOP.
  ENDMETHOD.

  METHOD releasenoteset_create_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    DATA(lv_ok) = zcl_itsm_relnote=>save_note(
      iv_incident_no = CONV #( ls_entity-incidentno )
      iv_note_text   = ls_entity-notetext
      iv_decision    = ls_entity-decision
      iv_model_name  = ls_entity-modelname ).

    IF lv_ok = abap_false.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_unlimited = 'Değişiklik özeti kaydedilemedi.'.
    ENDIF.

    DATA(ls_note) = zcl_itsm_relnote=>get_note( CONV #( ls_entity-incidentno ) ).

    er_entity-incidentno = ls_note-incident_no.
    er_entity-notetext   = ls_note-note_text.
    er_entity-decision   = ls_note-decision.
    er_entity-modelname  = ls_note-model_name.
    er_entity-approvedby = ls_note-approved_by.
    er_entity-approvedon = ls_note-approved_on.
    er_entity-approvedat = ls_note-approved_at.
  ENDMETHOD.

  METHOD releasenoteset_get_entity.
    READ TABLE it_key_tab INTO DATA(ls_key) INDEX 1.
    DATA(lv_incident_no) = ls_key-value.

    DATA(ls_note) = zcl_itsm_relnote=>get_note( CONV #( lv_incident_no ) ).

    " No note yet is not an error: return the key with empty fields
    er_entity-incidentno = lv_incident_no.

    IF ls_note-incident_no IS NOT INITIAL.
      er_entity-notetext   = ls_note-note_text.
      er_entity-decision   = ls_note-decision.
      er_entity-modelname  = ls_note-model_name.
      er_entity-approvedby = ls_note-approved_by.
      er_entity-approvedon = ls_note-approved_on.
      er_entity-approvedat = ls_note-approved_at.
    ENDIF.
  ENDMETHOD.

  METHOD releasenoteset_update_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    READ TABLE it_key_tab INTO DATA(ls_key) INDEX 1.
    DATA(lv_incident_no) = ls_key-value.

    DATA(lv_ok) = zcl_itsm_relnote=>save_note(
      iv_incident_no = CONV #( lv_incident_no )
      iv_note_text   = ls_entity-notetext
      iv_decision    = ls_entity-decision
      iv_model_name  = ls_entity-modelname ).

    IF lv_ok = abap_false.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_unlimited = 'Değişiklik özeti güncellenemedi.'.
    ENDIF.

    DATA(ls_note) = zcl_itsm_relnote=>get_note( CONV #( lv_incident_no ) ).

    er_entity-incidentno = ls_note-incident_no.
    er_entity-notetext   = ls_note-note_text.
    er_entity-decision   = ls_note-decision.
    er_entity-modelname  = ls_note-model_name.
    er_entity-approvedby = ls_note-approved_by.
    er_entity-approvedon = ls_note-approved_on.
    er_entity-approvedat = ls_note-approved_at.
  ENDMETHOD.

  METHOD requirementset_create_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    DATA(lv_req_id) = zcl_itsm_req=>create_requirement(
      iv_incident_no = CONV #( ls_entity-incidentno )
      iv_req_text    = ls_entity-reqtext
      iv_req_type    = ls_entity-reqtype
      iv_source_ref  = ls_entity-sourceref ).

    IF lv_req_id IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_unlimited = 'Gereksinim kaydedilemedi.'.
    ENDIF.

    er_entity-incidentno = ls_entity-incidentno.
    er_entity-reqid      = lv_req_id.
    er_entity-reqtext    = ls_entity-reqtext.
    er_entity-reqtype    = ls_entity-reqtype.
    er_entity-sourceref  = ls_entity-sourceref.
    er_entity-createdby  = sy-uname.
    er_entity-createdon  = sy-datum.
  ENDMETHOD.

  METHOD requirementset_delete_entity.
    DATA lv_incident_no TYPE zitsm_req-incident_no.
    DATA lv_req_id      TYPE zitsm_req-req_id.

    LOOP AT it_key_tab INTO DATA(ls_key).
      CASE ls_key-name.
        WHEN 'IncidentNo'.
          lv_incident_no = ls_key-value.
        WHEN 'ReqId'.
          lv_req_id = ls_key-value.
      ENDCASE.
    ENDLOOP.

    zcl_itsm_req=>delete_requirement(
      iv_incident_no = lv_incident_no
      iv_req_id      = lv_req_id ).
  ENDMETHOD.

  METHOD requirementset_get_entity.
    DATA lv_incident_no TYPE zitsm_req-incident_no.
    DATA lv_req_id      TYPE zitsm_req-req_id.

    LOOP AT it_key_tab INTO DATA(ls_key).
      CASE ls_key-name.
        WHEN 'IncidentNo'.
          lv_incident_no = ls_key-value.
        WHEN 'ReqId'.
          lv_req_id = ls_key-value.
      ENDCASE.
    ENDLOOP.

    DATA(lt_req) = zcl_itsm_req=>get_requirements( CONV #( lv_incident_no ) ).

    READ TABLE lt_req INTO DATA(ls_req) WITH KEY req_id = lv_req_id.
    IF sy-subrc = 0.
      er_entity-incidentno = ls_req-incident_no.
      er_entity-reqid      = ls_req-req_id.
      er_entity-reqtext    = ls_req-req_text.
      er_entity-reqtype    = ls_req-req_type.
      er_entity-sourceref  = ls_req-source_ref.
      er_entity-createdby  = ls_req-created_by.
      er_entity-createdon  = ls_req-created_on.
    ENDIF.
  ENDMETHOD.

  METHOD requirementset_get_entityset.
    DATA lv_incident_no TYPE zitsm_req-incident_no.

    READ TABLE it_key_tab INTO DATA(ls_key) WITH KEY name = 'IncidentNo'.
    IF sy-subrc = 0.
      lv_incident_no = ls_key-value.
    ELSE.
      LOOP AT it_filter_select_options INTO DATA(ls_filter).
        IF ls_filter-property = 'IncidentNo'.
          READ TABLE ls_filter-select_options INTO DATA(ls_so) INDEX 1.
          IF sy-subrc = 0.
            lv_incident_no = ls_so-low.
          ENDIF.
        ENDIF.
      ENDLOOP.
    ENDIF.

    DATA(lt_req) = zcl_itsm_req=>get_requirements( CONV #( lv_incident_no ) ).

    LOOP AT lt_req INTO DATA(ls_req).
      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-incidentno = ls_req-incident_no.
      <fs>-reqid      = ls_req-req_id.
      <fs>-reqtext    = ls_req-req_text.
      <fs>-reqtype    = ls_req-req_type.
      <fs>-sourceref  = ls_req-source_ref.
      <fs>-createdby  = ls_req-created_by.
      <fs>-createdon  = ls_req-created_on.
    ENDLOOP.
  ENDMETHOD.

  METHOD requirementset_update_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    DATA lv_incident_no TYPE zitsm_req-incident_no.
    DATA lv_req_id      TYPE zitsm_req-req_id.

    LOOP AT it_key_tab INTO DATA(ls_key).
      CASE ls_key-name.
        WHEN 'IncidentNo'.
          lv_incident_no = ls_key-value.
        WHEN 'ReqId'.
          lv_req_id = ls_key-value.
      ENDCASE.
    ENDLOOP.

    zcl_itsm_req=>update_requirement(
      iv_incident_no = lv_incident_no
      iv_req_id      = lv_req_id
      iv_req_text    = ls_entity-reqtext
      iv_req_type    = ls_entity-reqtype ).

    " update_requirement returns silently if the row is missing, so check first
    SELECT SINGLE * FROM zitsm_req INTO @DATA(ls_req)
      WHERE incident_no = @lv_incident_no
        AND req_id      = @lv_req_id.

    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_unlimited = 'Güncellenecek gereksinim bulunamadı.'.
    ENDIF.

    er_entity-incidentno = ls_req-incident_no.
    er_entity-reqid      = ls_req-req_id.
    er_entity-reqtext    = ls_req-req_text.
    er_entity-reqtype    = ls_req-req_type.
    er_entity-sourceref  = ls_req-source_ref.
    er_entity-createdby  = ls_req-created_by.
    er_entity-createdon  = ls_req-created_on.
  ENDMETHOD.

  METHOD suggestionset_create_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    DATA(lv_sug_id) = zcl_itsm_aisug=>create_suggestion(
      iv_incident_no = CONV #( ls_entity-incidentno )
      iv_sug_type    = ls_entity-sugtype
      iv_sug_value   = ls_entity-sugvalue
      iv_reason      = ls_entity-reason
      iv_source_ref  = ls_entity-sourceref
      iv_model_name  = ls_entity-modelname
      iv_decision    = ls_entity-decision
      iv_final_value = ls_entity-finalvalue
      iv_user_feedback = ls_entity-userfeedback ).

    IF lv_sug_id IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_unlimited = 'AI önerisi kaydedilemedi.'.
    ENDIF.

    er_entity-incidentno = ls_entity-incidentno.
    er_entity-sugid      = lv_sug_id.
    er_entity-sugtype    = ls_entity-sugtype.
    er_entity-sugvalue   = ls_entity-sugvalue.
    er_entity-reason     = ls_entity-reason.
    er_entity-sourceref  = ls_entity-sourceref.
    er_entity-modelname  = ls_entity-modelname.
    er_entity-createdby  = sy-uname.
    er_entity-createdon  = sy-datum.
    er_entity-createdat  = sy-uzeit.
    er_entity-decision   = ls_entity-decision.
    er_entity-finalvalue = ls_entity-finalvalue.
    er_entity-userfeedback = ls_entity-userfeedback.
  ENDMETHOD.

  METHOD suggestionset_get_entityset.
    DATA lv_incident_no TYPE zitsm_aisug-incident_no.

    READ TABLE it_key_tab INTO DATA(ls_key) WITH KEY name = 'IncidentNo'.
    IF sy-subrc = 0.
      lv_incident_no = ls_key-value.
    ELSE.
      LOOP AT it_filter_select_options INTO DATA(ls_filter).
        IF ls_filter-property = 'IncidentNo'.
          READ TABLE ls_filter-select_options INTO DATA(ls_so) INDEX 1.
          IF sy-subrc = 0.
            lv_incident_no = ls_so-low.
          ENDIF.
        ENDIF.
      ENDLOOP.
    ENDIF.

    DATA lt_sug TYPE zitsm_tt_aisug.
    IF lv_incident_no IS NOT INITIAL.
      lt_sug = zcl_itsm_aisug=>get_suggestions( CONV #( lv_incident_no ) ).
    ELSE.
      " No filter returns all rows (used by the dashboard)
      SELECT * FROM zitsm_aisug INTO TABLE lt_sug.
    ENDIF.

    LOOP AT lt_sug INTO DATA(ls_sug).
      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-incidentno = ls_sug-incident_no.
      <fs>-sugid      = ls_sug-sug_id.
      <fs>-sugtype    = ls_sug-sug_type.
      <fs>-sugvalue   = ls_sug-sug_value.
      <fs>-reason     = ls_sug-reason.
      <fs>-sourceref  = ls_sug-source_ref.
      <fs>-decision   = ls_sug-decision.
      <fs>-finalvalue = ls_sug-final_value.
      <fs>-modelname  = ls_sug-model_name.
      <fs>-createdby  = ls_sug-created_by.
      <fs>-createdon  = ls_sug-created_on.
      <fs>-createdat  = ls_sug-created_at.
      <fs>-userfeedback = ls_sug-user_feedback.
    ENDLOOP.
  ENDMETHOD.

  METHOD suggestionset_update_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    DATA lv_incident_no TYPE zitsm_aisug-incident_no.
    DATA lv_sug_id      TYPE zitsm_aisug-sug_id.

    LOOP AT it_key_tab INTO DATA(ls_key).
      CASE ls_key-name.
        WHEN 'IncidentNo'.
          lv_incident_no = ls_key-value.
        WHEN 'SugId'.
          lv_sug_id = ls_key-value.
      ENDCASE.
    ENDLOOP.

    zcl_itsm_aisug=>update_decision(
      iv_incident_no = lv_incident_no
      iv_sug_id      = lv_sug_id
      iv_decision    = ls_entity-decision
      iv_final_value = ls_entity-finalvalue
      iv_user_feedback = ls_entity-userfeedback ).

    SELECT SINGLE * FROM zitsm_aisug INTO @DATA(ls_sug)
      WHERE incident_no = @lv_incident_no
        AND sug_id      = @lv_sug_id.

    IF sy-subrc = 0.
      er_entity-incidentno = ls_sug-incident_no.
      er_entity-sugid      = ls_sug-sug_id.
      er_entity-sugtype    = ls_sug-sug_type.
      er_entity-sugvalue   = ls_sug-sug_value.
      er_entity-reason     = ls_sug-reason.
      er_entity-sourceref  = ls_sug-source_ref.
      er_entity-decision   = ls_sug-decision.
      er_entity-finalvalue = ls_sug-final_value.
      er_entity-modelname  = ls_sug-model_name.
      er_entity-createdby  = ls_sug-created_by.
      er_entity-createdon  = ls_sug-created_on.
      er_entity-createdat  = ls_sug-created_at.
      er_entity-userfeedback = ls_sug-user_feedback.
    ENDIF.
  ENDMETHOD.

  METHOD testhistoryset_get_entityset.
    " Test history (FR-20), read-only
    DATA lv_incident_no TYPE zitsm_test_hist-incident_no.

    LOOP AT it_filter_select_options INTO DATA(ls_filter).
      IF ls_filter-property = 'IncidentNo'.
        READ TABLE ls_filter-select_options INTO DATA(ls_so) INDEX 1.
        IF sy-subrc = 0.
          lv_incident_no = ls_so-low.
        ENDIF.
      ENDIF.
    ENDLOOP.

    " Filter is mandatory to avoid returning the whole history
    IF lv_incident_no IS INITIAL.
      RETURN.
    ENDIF.

    DATA(lt_hist) = zcl_itsm_test=>get_history( lv_incident_no ).

    LOOP AT lt_hist INTO DATA(ls_hist).
      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-incidentno = ls_hist-incident_no.
      <fs>-testid     = ls_hist-test_id.
      <fs>-histno     = ls_hist-hist_no.
      <fs>-action     = ls_hist-action.
      <fs>-testresult = ls_hist-test_result.
      <fs>-note       = ls_hist-note.
      <fs>-changedby  = ls_hist-changed_by.
      <fs>-changedon  = ls_hist-changed_on.
      <fs>-changedat  = ls_hist-changed_at.
    ENDLOOP.
  ENDMETHOD.

  METHOD testset_create_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    DATA(lv_test_id) = zcl_itsm_test=>create_test(
      iv_incident_no = CONV #( ls_entity-incidentno )
      iv_test_text   = ls_entity-testtext
      iv_test_type   = ls_entity-testtype
      iv_is_critical = ls_entity-iscritical
      iv_req_id      = ls_entity-reqid
      iv_expected_result = ls_entity-expectedresult ).

    IF lv_test_id IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_unlimited = 'Test adımı kaydedilemedi.'.
    ENDIF.

    er_entity-incidentno = ls_entity-incidentno.
    er_entity-testid     = lv_test_id.
    er_entity-testtext   = ls_entity-testtext.
    er_entity-testtype   = ls_entity-testtype.
    er_entity-iscritical = ls_entity-iscritical.
    er_entity-reqid      = ls_entity-reqid.
    er_entity-isdone     = ''.
    er_entity-testresult = ''.
    er_entity-expectedresult = ls_entity-expectedresult.
  ENDMETHOD.

  METHOD testset_delete_entity.
    DATA lv_incident_no TYPE zitsm_test-incident_no.
    DATA lv_test_id     TYPE zitsm_test-test_id.

    LOOP AT it_key_tab INTO DATA(ls_key).
      CASE ls_key-name.
        WHEN 'IncidentNo'.
          lv_incident_no = ls_key-value.
        WHEN 'TestId'.
          lv_test_id = ls_key-value.
      ENDCASE.
    ENDLOOP.

    zcl_itsm_test=>delete_test(
      iv_incident_no = lv_incident_no
      iv_test_id     = lv_test_id ).
  ENDMETHOD.

  METHOD testset_get_entity.
    DATA lv_incident_no TYPE zitsm_test-incident_no.
    DATA lv_test_id     TYPE zitsm_test-test_id.

    LOOP AT it_key_tab INTO DATA(ls_key).
      CASE ls_key-name.
        WHEN 'IncidentNo'.
          lv_incident_no = ls_key-value.
        WHEN 'TestId'.
          lv_test_id = ls_key-value.
      ENDCASE.
    ENDLOOP.

    SELECT SINGLE * FROM zitsm_test INTO @DATA(ls_test)
      WHERE incident_no = @lv_incident_no
        AND test_id     = @lv_test_id.

    IF sy-subrc = 0.
      er_entity-incidentno = ls_test-incident_no.
      er_entity-testid     = ls_test-test_id.
      er_entity-testtext   = ls_test-test_text.
      er_entity-isdone     = ls_test-is_done.
      er_entity-doneby     = ls_test-done_by.
      er_entity-doneon     = ls_test-done_on.
      er_entity-testtype   = ls_test-test_type.
      er_entity-iscritical = ls_test-is_critical.
      er_entity-testresult = ls_test-test_result.
      er_entity-note       = ls_test-note.
      er_entity-reqid      = ls_test-req_id.
      er_entity-expectedresult = ls_test-expected_result.
    ENDIF.
  ENDMETHOD.

  METHOD testset_get_entityset.
    DATA lv_incident_no TYPE zitsm_test-incident_no.

    READ TABLE it_key_tab INTO DATA(ls_key) WITH KEY name = 'IncidentNo'.
    IF sy-subrc = 0.
      lv_incident_no = ls_key-value.
    ELSE.
      LOOP AT it_filter_select_options INTO DATA(ls_filter).
        IF ls_filter-property = 'IncidentNo'.
          READ TABLE ls_filter-select_options INTO DATA(ls_so) INDEX 1.
          IF sy-subrc = 0.
            lv_incident_no = ls_so-low.
          ENDIF.
        ENDIF.
      ENDLOOP.
    ENDIF.

    DATA lt_test TYPE STANDARD TABLE OF zitsm_test.
    IF lv_incident_no IS NOT INITIAL.
      lt_test = zcl_itsm_test=>get_tests( CONV #( lv_incident_no ) ).
    ELSE.
      " No filter returns all rows (used by the dashboard)
      SELECT * FROM zitsm_test INTO TABLE lt_test.
    ENDIF.

    LOOP AT lt_test INTO DATA(ls_test).
      APPEND INITIAL LINE TO et_entityset ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-incidentno = ls_test-incident_no.
      <fs>-testid     = ls_test-test_id.
      <fs>-testtext   = ls_test-test_text.
      <fs>-isdone     = ls_test-is_done.
      <fs>-doneby     = ls_test-done_by.
      <fs>-doneon     = ls_test-done_on.
      <fs>-testtype   = ls_test-test_type.
      <fs>-iscritical = ls_test-is_critical.
      <fs>-testresult = ls_test-test_result.
      <fs>-note       = ls_test-note.
      <fs>-reqid      = ls_test-req_id.
      <fs>-expectedresult = ls_test-expected_result.
    ENDLOOP.
  ENDMETHOD.

  METHOD testset_update_entity.
    DATA ls_entity LIKE er_entity.

    io_data_provider->read_entry_data( IMPORTING es_data = ls_entity ).

    DATA lv_incident_no TYPE zitsm_test-incident_no.
    DATA lv_test_id     TYPE zitsm_test-test_id.

    LOOP AT it_key_tab INTO DATA(ls_key).
      CASE ls_key-name.
        WHEN 'IncidentNo'.
          lv_incident_no = ls_key-value.
        WHEN 'TestId'.
          lv_test_id = ls_key-value.
      ENDCASE.
    ENDLOOP.

    " 1) Expert may have edited the test definition
    zcl_itsm_test=>edit_test(
      iv_incident_no = lv_incident_no
      iv_test_id     = lv_test_id
      iv_test_text   = ls_entity-testtext
      iv_test_type   = ls_entity-testtype
      iv_is_critical = ls_entity-iscritical
      iv_req_id      = ls_entity-reqid
      iv_expected_result = ls_entity-expectedresult ).

    " 2) Execution result + note
    zcl_itsm_test=>update_test(
      iv_incident_no = lv_incident_no
      iv_test_id     = lv_test_id
      iv_test_result = ls_entity-testresult
      iv_note        = ls_entity-note ).

    SELECT SINGLE * FROM zitsm_test INTO @DATA(ls_test)
      WHERE incident_no = @lv_incident_no
        AND test_id     = @lv_test_id.

    IF sy-subrc = 0.
      er_entity-incidentno = ls_test-incident_no.
      er_entity-testid     = ls_test-test_id.
      er_entity-testtext   = ls_test-test_text.
      er_entity-isdone     = ls_test-is_done.
      er_entity-doneby     = ls_test-done_by.
      er_entity-doneon     = ls_test-done_on.
      er_entity-testtype   = ls_test-test_type.
      er_entity-iscritical = ls_test-is_critical.
      er_entity-testresult = ls_test-test_result.
      er_entity-note       = ls_test-note.
      er_entity-reqid      = ls_test-req_id.
      er_entity-expectedresult = ls_test-expected_result.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
