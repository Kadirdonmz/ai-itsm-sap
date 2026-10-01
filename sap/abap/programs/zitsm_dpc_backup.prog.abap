* Exports all ITSM classes, programs and table definitions to one text file.
REPORT zitsm_dpc_backup LINE-SIZE 255.

PARAMETERS p_file TYPE string DEFAULT 'C:\Users\MSI\Desktop\ITSM_export.txt' LOWER CASE.

START-OF-SELECTION.
  DATA lt_out TYPE STANDARD TABLE OF string WITH EMPTY KEY.
  DATA lt_src TYPE STANDARD TABLE OF string WITH EMPTY KEY.
  DATA lt_sec TYPE STANDARD TABLE OF progname WITH EMPTY KEY.
  DATA lv_cnt TYPE i.

  " 1) Classes: ZCL_ITSM*, ZCX_ITSM*, ZCL_ZITSM_SRV_DPC_EXT
  SELECT clsname FROM seoclass
    WHERE clsname LIKE 'ZCL_ITSM%'
       OR clsname LIKE 'ZCX_ITSM%'
       OR clsname = 'ZCL_ZITSM_SRV_DPC_EXT'
    ORDER BY clsname
    INTO TABLE @DATA(lt_cls).

  LOOP AT lt_cls INTO DATA(ls_cls).
    APPEND |@@@CLASS { ls_cls-clsname }| TO lt_out.

    lt_sec = VALUE #(
      ( cl_oo_classname_service=>get_pubsec_name( ls_cls-clsname ) )
      ( cl_oo_classname_service=>get_prosec_name( ls_cls-clsname ) )
      ( cl_oo_classname_service=>get_prisec_name( ls_cls-clsname ) ) ).
    LOOP AT lt_sec INTO DATA(lv_sec).
      CLEAR lt_src.
      READ REPORT lv_sec INTO lt_src.
      IF sy-subrc = 0.
        APPEND LINES OF lt_src TO lt_out.
      ENDIF.
    ENDLOOP.

    DATA(lt_inc) = cl_oo_classname_service=>get_all_method_includes( ls_cls-clsname ).
    SORT lt_inc BY cpdkey-cpdname.
    LOOP AT lt_inc INTO DATA(ls_inc).
      CLEAR lt_src.
      READ REPORT ls_inc-incname INTO lt_src.
      CHECK sy-subrc = 0.
      APPEND |@@@METHOD { ls_inc-cpdkey-cpdname }| TO lt_out.
      APPEND LINES OF lt_src TO lt_out.
      lv_cnt = lv_cnt + 1.
    ENDLOOP.
  ENDLOOP.

  " 2) Programs and includes: ZITSM*
  SELECT name FROM trdir
    WHERE name LIKE 'ZITSM%'
    ORDER BY name
    INTO TABLE @DATA(lt_prog).

  LOOP AT lt_prog INTO DATA(ls_prog).
    CLEAR lt_src.
    READ REPORT ls_prog-name INTO lt_src.
    CHECK sy-subrc = 0.
    APPEND |@@@PROGRAM { ls_prog-name }| TO lt_out.
    APPEND LINES OF lt_src TO lt_out.
  ENDLOOP.

  " 3) Table definitions: ZITSM* (field, key, type, length)
  SELECT tabname, fieldname, position, keyflag, rollname, datatype, leng
    FROM dd03l
    WHERE tabname LIKE 'ZITSM%'
      AND as4local = 'A'
    ORDER BY tabname, position
    INTO TABLE @DATA(lt_fld).

  APPEND |@@@DDIC| TO lt_out.
  LOOP AT lt_fld INTO DATA(ls_fld).
    APPEND |{ ls_fld-tabname };{ ls_fld-fieldname };{ ls_fld-keyflag };{ ls_fld-rollname };{ ls_fld-datatype };{ ls_fld-leng }| TO lt_out.
  ENDLOOP.

  cl_gui_frontend_services=>gui_download(
    EXPORTING
      filename = p_file
      codepage = '4110'
    CHANGING
      data_tab = lt_out
    EXCEPTIONS
      OTHERS   = 1 ).

  IF sy-subrc = 0.
    WRITE: / |{ lines( lt_cls ) } sınıf, { lv_cnt } metot, { lines( lt_prog ) } program, { lines( lt_fld ) } tablo alanı yazıldı:|.
    WRITE: / p_file.
  ELSE.
    WRITE: / 'Dosya yazılamadı.'.
  ENDIF.
