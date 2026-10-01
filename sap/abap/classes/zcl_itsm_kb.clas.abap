CLASS zcl_itsm_kb DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.

    TYPES: tt_kb TYPE STANDARD TABLE OF zitsm_kb WITH DEFAULT KEY.

    "! Get all knowledge base articles
    CLASS-METHODS get_articles
      RETURNING VALUE(rt_articles) TYPE tt_kb.

    "! Get a single article by id
    CLASS-METHODS get_article
      IMPORTING iv_kb_id          TYPE zitsm_kb-kb_id
      RETURNING VALUE(rs_article) TYPE zitsm_kb.

    "! Create a new knowledge base article, returns the new kb_id
    CLASS-METHODS create_article
      IMPORTING iv_title        TYPE zitsm_kb-title
                iv_problem      TYPE zitsm_kb-problem
                iv_cause        TYPE zitsm_kb-cause OPTIONAL
                iv_solution     TYPE zitsm_kb-solution OPTIONAL
                iv_check_steps  TYPE zitsm_kb-check_steps OPTIONAL
                iv_tags         TYPE zitsm_kb-tags OPTIONAL
                iv_source_inc   TYPE zitsm_kb-source_inc OPTIONAL
      RETURNING VALUE(rv_kb_id) TYPE zitsm_kb-kb_id.

    "! Update an existing article
    CLASS-METHODS update_article
      IMPORTING iv_kb_id       TYPE zitsm_kb-kb_id
                iv_title       TYPE zitsm_kb-title
                iv_problem     TYPE zitsm_kb-problem
                iv_cause       TYPE zitsm_kb-cause OPTIONAL
                iv_solution    TYPE zitsm_kb-solution OPTIONAL
                iv_check_steps TYPE zitsm_kb-check_steps OPTIONAL
                iv_tags        TYPE zitsm_kb-tags OPTIONAL.

    "! Delete an article
    CLASS-METHODS delete_article
      IMPORTING iv_kb_id TYPE zitsm_kb-kb_id.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_itsm_kb IMPLEMENTATION.

  METHOD create_article.
    " Find the highest kb_id, add 1
    DATA lv_max TYPE i.

    SELECT MAX( kb_id ) FROM zitsm_kb INTO @DATA(lv_max_id).

    lv_max = lv_max_id.
    lv_max = lv_max + 1.
    rv_kb_id = |{ lv_max WIDTH = 10 PAD = '0' ALIGN = RIGHT }|.

    DATA ls_kb TYPE zitsm_kb.
    ls_kb-kb_id       = rv_kb_id.
    ls_kb-title       = iv_title.
    ls_kb-problem     = iv_problem.
    ls_kb-cause       = iv_cause.
    ls_kb-solution    = iv_solution.
    ls_kb-check_steps = iv_check_steps.
    ls_kb-tags        = iv_tags.
    ls_kb-source_inc  = iv_source_inc.
    ls_kb-created_by  = sy-uname.
    ls_kb-created_on  = sy-datum.

    INSERT zitsm_kb FROM ls_kb.
  ENDMETHOD.

  METHOD delete_article.
    DELETE FROM zitsm_kb WHERE kb_id = iv_kb_id.
  ENDMETHOD.

  METHOD get_article.
    SELECT SINGLE * FROM zitsm_kb INTO rs_article
      WHERE kb_id = iv_kb_id.
  ENDMETHOD.

  METHOD get_articles.
    SELECT * FROM zitsm_kb INTO TABLE rt_articles
      ORDER BY kb_id.
  ENDMETHOD.

  METHOD update_article.
    SELECT SINGLE * FROM zitsm_kb INTO @DATA(ls_kb)
      WHERE kb_id = @iv_kb_id.

    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    ls_kb-title       = iv_title.
    ls_kb-problem     = iv_problem.
    ls_kb-cause       = iv_cause.
    ls_kb-solution    = iv_solution.
    ls_kb-check_steps = iv_check_steps.
    ls_kb-tags        = iv_tags.

    UPDATE zitsm_kb FROM ls_kb.
  ENDMETHOD.

ENDCLASS.
