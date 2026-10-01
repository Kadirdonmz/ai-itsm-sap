CLASS zcl_itsm_category DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  " Categories and their default support groups, maintained via SM30.
  " The AI service reads its allowed category list from here.
  PUBLIC SECTION.

    TYPES tt_category TYPE STANDARD TABLE OF zitsm_category WITH DEFAULT KEY.

    CLASS-METHODS get_categories
      IMPORTING iv_only_active       TYPE abap_bool DEFAULT abap_true
      RETURNING VALUE(rt_categories) TYPE tt_category.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_itsm_category IMPLEMENTATION.

  METHOD get_categories.
    IF iv_only_active = abap_true.
      SELECT * FROM zitsm_category
        WHERE is_active = @abap_true
        ORDER BY category
        INTO TABLE @rt_categories.
    ELSE.
      SELECT * FROM zitsm_category
        ORDER BY category
        INTO TABLE @rt_categories.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
